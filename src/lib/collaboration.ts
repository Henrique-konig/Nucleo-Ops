import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan, can } from "@/lib/permissions";
import { cardHref, notifyUsers } from "@/lib/inbox";
import { parseMentions, plainText } from "@/lib/mentions";
import { describeAction } from "@/lib/activity-format";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";

// Colaboração nos cartões: comentários com menções, anexos e o feed de atividades
// (cartão e chamado). Cada escrita grava a mudança, o registro de auditoria e as
// notificações na mesma transação.

type Tx = Prisma.TransactionClient;

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_CARD = 20;

// Tipos que o navegador pode abrir direto; os demais são sempre baixados.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

const id = z.string().min(1).max(64);
const content = z.string().trim().min(1, "Escreva o comentário").max(5_000);

export const collaborationSchemas = {
  addComment: z.object({ cardId: id, content }),
  editComment: z.object({ commentId: id, content }),
  deleteComment: z.object({ commentId: id }),
  deleteAttachment: z.object({ attachmentId: id }),
};

type Input<K extends keyof typeof collaborationSchemas> = z.input<(typeof collaborationSchemas)[K]>;

async function findCard(tx: Tx | typeof db, actor: Actor, cardId: string) {
  const card = await tx.card.findFirst({ where: { id: cardId, board: { teamId: actor.teamId }, archivedAt: null } });
  if (!card) throw new NotFoundError("Cartão");
  return card;
}

/** Só pessoas da equipe que enxergam o quadro podem ser mencionadas. */
async function validMentions(tx: Tx, actor: Actor, text: string) {
  const ids = parseMentions(text);
  if (ids.length === 0) return [];
  const users = await tx.user.findMany({
    where: { id: { in: ids }, teamId: actor.teamId, active: true, role: { in: ["TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"] } },
    select: { id: true },
  });
  const valid = new Set(users.map((u) => u.id));
  return ids.filter((i) => valid.has(i));
}

// ---------------------------------------------------------------------------
// Comentários

export async function addComment(actor: Actor & { name?: string }, input: Input<"addComment">) {
  assertCan(actor.role, "card:comment");
  const data = collaborationSchemas.addComment.parse(input);
  return db.$transaction(async (tx) => {
    const card = await findCard(tx, actor, data.cardId);
    const mentionIds = await validMentions(tx, actor, data.content);
    const comment = await tx.cardComment.create({ data: { cardId: card.id, authorId: actor.id, content: data.content, mentionIds } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "comment.add", targetType: "comment", targetId: comment.id,
      payload: { cardId: card.id, mentionIds },
    });

    const author = actor.name ?? (await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } })).name;
    const base = { teamId: actor.teamId, actorId: actor.id, href: cardHref(card), cardId: card.id, ticketId: card.ticketId, body: plainText(data.content) };
    const mentioned = await notifyUsers(tx, mentionIds, { ...base, type: "MENTION", title: `${author} mencionou você em "${card.title}"` });
    // O responsável recebe aviso de comentário, a menos que já tenha sido mencionado.
    if (card.assigneeId && !mentioned.includes(card.assigneeId)) {
      await notifyUsers(tx, [card.assigneeId], { ...base, type: "COMMENT", title: `${author} comentou em "${card.title}"` });
    }
    return comment;
  });
}

async function findOwnComment(tx: Tx, actor: Actor, commentId: string) {
  const comment = await tx.cardComment.findFirst({
    where: { id: commentId, deletedAt: null, card: { board: { teamId: actor.teamId }, archivedAt: null } },
  });
  if (!comment) throw new NotFoundError("Comentário");
  return comment;
}

export async function editComment(actor: Actor, input: Input<"editComment">) {
  assertCan(actor.role, "card:comment");
  const data = collaborationSchemas.editComment.parse(input);
  return db.$transaction(async (tx) => {
    const comment = await findOwnComment(tx, actor, data.commentId);
    if (comment.authorId !== actor.id) throw new BusinessError("Só quem escreveu pode editar o comentário");
    if (comment.content === data.content) return comment;
    const mentionIds = await validMentions(tx, actor, data.content);
    const updated = await tx.cardComment.update({ where: { id: comment.id }, data: { content: data.content, mentionIds, editedAt: new Date() } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "comment.edit", targetType: "comment", targetId: comment.id,
      payload: { cardId: comment.cardId, from: comment.content, to: data.content },
    });
    // Só quem foi mencionado agora é avisado.
    const added = mentionIds.filter((m) => !comment.mentionIds.includes(m));
    if (added.length > 0) {
      const card = await tx.card.findUniqueOrThrow({ where: { id: comment.cardId } });
      const author = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
      await notifyUsers(tx, added, {
        teamId: actor.teamId, actorId: actor.id, type: "MENTION", title: `${author.name} mencionou você em "${card.title}"`,
        body: plainText(data.content), href: cardHref(card), cardId: card.id, ticketId: card.ticketId,
      });
    }
    return updated;
  });
}

export async function deleteComment(actor: Actor, input: Input<"deleteComment">) {
  assertCan(actor.role, "card:comment");
  const data = collaborationSchemas.deleteComment.parse(input);
  return db.$transaction(async (tx) => {
    const comment = await findOwnComment(tx, actor, data.commentId);
    // Coordenação pode moderar; os demais só removem os próprios comentários.
    if (comment.authorId !== actor.id && !can(actor.role, "column:manage")) {
      throw new BusinessError("Só quem escreveu pode remover o comentário");
    }
    await tx.cardComment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "comment.delete", targetType: "comment", targetId: comment.id,
      payload: { cardId: comment.cardId, content: comment.content },
    });
  });
}

// ---------------------------------------------------------------------------
// Anexos

export async function addAttachment(actor: Actor, cardId: string, file: File) {
  assertCan(actor.role, "card:edit");
  if (!(file instanceof File) || file.size === 0) throw new BusinessError("Escolha um arquivo");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new BusinessError("O arquivo passa de 4 MB");
  const filename = z.string().trim().min(1).max(200).parse(file.name.replace(/[\\/\r\n]/g, "_"));
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream";
  const bytes = new Uint8Array(await file.arrayBuffer());

  return db.$transaction(async (tx) => {
    const card = await findCard(tx, actor, cardId);
    if ((await tx.cardAttachment.count({ where: { cardId: card.id } })) >= MAX_ATTACHMENTS_PER_CARD) {
      throw new BusinessError(`Limite de ${MAX_ATTACHMENTS_PER_CARD} anexos por cartão`);
    }
    const attachment = await tx.cardAttachment.create({
      data: { cardId: card.id, uploaderId: actor.id, filename, contentType, size: bytes.byteLength, data: bytes },
      select: { id: true, filename: true, size: true, contentType: true, createdAt: true },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "attachment.add", targetType: "attachment", targetId: attachment.id,
      payload: { cardId: card.id, filename, size: bytes.byteLength, contentType },
    });
    return attachment;
  });
}

export async function deleteAttachment(actor: Actor, input: Input<"deleteAttachment">) {
  assertCan(actor.role, "card:edit");
  const data = collaborationSchemas.deleteAttachment.parse(input);
  return db.$transaction(async (tx) => {
    const attachment = await tx.cardAttachment.findFirst({
      where: { id: data.attachmentId, card: { board: { teamId: actor.teamId }, archivedAt: null } },
      select: { id: true, cardId: true, filename: true, uploaderId: true },
    });
    if (!attachment) throw new NotFoundError("Anexo");
    await tx.cardAttachment.delete({ where: { id: attachment.id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "attachment.delete", targetType: "attachment", targetId: attachment.id,
      payload: { cardId: attachment.cardId, filename: attachment.filename },
    });
  });
}

/** Conteúdo do anexo para download, conferindo a equipe. */
export async function getAttachmentFile(actor: Actor, attachmentId: string) {
  assertCan(actor.role, "board:view");
  const file = await db.cardAttachment.findFirst({
    where: { id: attachmentId, card: { board: { teamId: actor.teamId } } },
    select: { filename: true, contentType: true, size: true, data: true },
  });
  if (!file) throw new NotFoundError("Anexo");
  return { ...file, inline: INLINE_TYPES.has(file.contentType) };
}

// ---------------------------------------------------------------------------
// Feed de atividades

export type ActivityItem = {
  id: string;
  at: Date;
  who: string;
  kind: "user" | "agent";
  text: string;
  type: string;
};

const AGENT_NAMES: Record<string, string> = {
  TRIAGE: "Agente de triagem", RESEARCH: "Agente de pesquisa", EXECUTION: "Agente de execução", SUMMARY: "Agente de resumo", CHATBOT: "Assistente",
};

/** Ações sobre o cartão (e seus itens, comentários e anexos) e sobre o chamado ligado a ele. */
async function activityFor(teamId: string, target: { cardId?: string | null; ticketId?: string | null }, limit: number): Promise<ActivityItem[]> {
  const or: Prisma.ActionWhereInput[] = [];
  if (target.cardId) {
    or.push(
      { targetType: "card", targetId: target.cardId },
      { targetType: { in: ["checklist_item", "comment", "attachment"] }, payload: { path: ["cardId"], equals: target.cardId } },
    );
  }
  if (target.ticketId) {
    or.push(
      { targetType: "ticket", targetId: target.ticketId },
      { targetType: { in: ["draft", "execution"] }, payload: { path: ["ticketId"], equals: target.ticketId } },
    );
  }
  if (or.length === 0) return [];

  const actions = await db.action.findMany({
    where: { teamId, OR: or },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, type: true, payload: true, createdAt: true,
      user: { select: { name: true } },
      agent: { select: { type: true } },
    },
  });

  const [columns, users] = await Promise.all([
    db.column.findMany({ where: { board: { teamId } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { teamId }, select: { id: true, name: true } }),
  ]);
  const ctx = { columns: new Map(columns.map((c) => [c.id, c.name])), users: new Map(users.map((u) => [u.id, u.name])) };

  return actions.map((a) => ({
    id: a.id,
    at: a.createdAt,
    who: a.agent ? AGENT_NAMES[a.agent.type] ?? "Agente" : a.user?.name ?? "Sistema",
    kind: a.agent ? "agent" : "user",
    text: describeAction(a.type, a.payload, ctx),
    type: a.type,
  }));
}

export async function ticketActivity(actor: Actor, ticketId: string, limit = 60) {
  assertCan(actor.role, "board:view");
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId }, select: { id: true, card: { select: { id: true } } } });
  if (!ticket) throw new NotFoundError("Chamado");
  return activityFor(actor.teamId, { ticketId: ticket.id, cardId: ticket.card?.id }, limit);
}

/** Tudo o que o diálogo do cartão mostra além dos campos: comentários, anexos e atividade. */
export async function getCardDetails(actor: Actor, cardId: string) {
  assertCan(actor.role, "board:view");
  const card = await findCard(db, actor, cardId);
  const [comments, attachments, activity] = await Promise.all([
    db.cardComment.findMany({
      where: { cardId: card.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, createdAt: true, editedAt: true, author: { select: { id: true, name: true } } },
    }),
    db.cardAttachment.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, size: true, contentType: true, createdAt: true, uploader: { select: { name: true } } },
    }),
    activityFor(actor.teamId, { cardId: card.id, ticketId: card.ticketId }, 40),
  ]);
  return { comments, attachments, activity };
}

export type CardDetails = Awaited<ReturnType<typeof getCardDetails>>;
