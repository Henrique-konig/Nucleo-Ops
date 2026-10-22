import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { positionAt } from "@/lib/ordering";
import { enqueue } from "@/lib/jobs/queue";
import { Prisma } from "@/generated/prisma/client";
import type { Channel, Priority, TicketStatus } from "@/generated/prisma/enums";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";

// Chamados: abertura por qualquer canal, conversa com o solicitante e status.
// Toda mudança gera registro de auditoria e, quando o solicitante precisa saber,
// uma notificação pelo mesmo canal por onde o chamado foi aberto (RF-07).

type Tx = Prisma.TransactionClient;

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando solicitante",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  FORM: "Formulário",
  EMAIL: "E-mail",
  CHAT: "Chat",
  WEBHOOK: "Webhook",
  SLACK: "Slack",
  TEAMS: "Teams",
};

const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];

// ---------------------------------------------------------------------------
// Solicitantes

/**
 * Usuário do sistema da equipe: autor de ações que não partem de uma pessoa
 * (automações, rotinas agendadas). Fica inativo, sem senha, e não faz login.
 */
export async function getSystemUser(tx: Tx | typeof db, teamId: string) {
  const email = `sistema+${teamId}@plantao.local`;
  return tx.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Plantão (sistema)", role: "AUDITOR", active: false, teamId },
  });
}

/**
 * Solicitante identificado por e-mail (e-mail, webhook, Slack). Cria a conta de
 * solicitante, sem senha, na primeira vez. E-mail de outra equipe não é vinculado.
 */
export async function ensureRequester(tx: Tx, teamId: string, email: string, name?: string | null) {
  const normalized = email.trim().toLowerCase();
  const existing = await tx.user.findUnique({ where: { email: normalized } });
  if (existing) return existing.teamId === teamId ? existing : null;
  return tx.user.create({
    data: { email: normalized, name: name?.trim() || normalized.split("@")[0], role: "REQUESTER", teamId },
  });
}

// ---------------------------------------------------------------------------
// Abertura

export const newTicketSchema = z.object({
  title: z.string().trim().min(3, "Descreva o assunto em poucas palavras").max(200),
  description: z.string().trim().min(5, "Conte um pouco mais sobre o problema").max(20_000),
  category: z.string().trim().max(60).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

export type NewTicket = z.input<typeof newTicketSchema> & {
  teamId: string;
  channel: Channel;
  requester: { userId: string } | { email: string; name?: string | null };
  externalId?: string;
  messageExternalId?: string;
  // Conversas do chatbot só viram cartão quando passam para um humano.
  createCard?: boolean;
};

async function firstColumn(tx: Tx, teamId: string) {
  return tx.column.findFirst({
    where: { board: { teamId } },
    orderBy: [{ board: { createdAt: "asc" } }, { position: "asc" }],
  });
}

/** Cria o cartão do chamado na coluna de entrada do quadro principal (RF-03). */
export async function createCardForTicket(tx: Tx, ticket: { id: string; teamId: string; title: string }, actorId: string) {
  const column = await firstColumn(tx, ticket.teamId);
  if (!column) return null;
  const last = await tx.card.findFirst({ where: { columnId: column.id, archivedAt: null }, orderBy: { position: "desc" } });
  const card = await tx.card.create({
    data: {
      title: ticket.title,
      boardId: column.boardId,
      columnId: column.id,
      ticketId: ticket.id,
      position: positionAt(last ? [last] : [], 1),
    },
  });
  await recordAction(tx, {
    teamId: ticket.teamId, userId: actorId, type: "card.create", targetType: "card", targetId: card.id,
    payload: { title: card.title, columnId: column.id, ticketId: ticket.id },
  });
  return card;
}

/**
 * Abre um chamado (RF-01). Idempotente por (equipe, canal, externalId): repetir
 * a entrega do mesmo e-mail ou evento devolve o chamado já existente.
 */
export async function createTicket(input: NewTicket) {
  const data = newTicketSchema.parse(input);
  if (input.externalId) {
    const existing = await db.ticket.findFirst({ where: { teamId: input.teamId, channel: input.channel, externalId: input.externalId } });
    if (existing) return { ticket: existing, created: false };
  }

  try {
    const ticket = await db.$transaction(async (tx) => {
      const requester =
        "userId" in input.requester
          ? await tx.user.findFirst({ where: { id: input.requester.userId, teamId: input.teamId } })
          : await ensureRequester(tx, input.teamId, input.requester.email, input.requester.name);
      const actor = requester ?? (await getSystemUser(tx, input.teamId));
      const requesterEmail = requester?.email ?? ("email" in input.requester ? input.requester.email.toLowerCase() : null);
      const requesterName = requester?.name ?? ("name" in input.requester ? input.requester.name : null);

      const ticket = await tx.ticket.create({
        data: {
          teamId: input.teamId,
          channel: input.channel,
          externalId: input.externalId,
          title: data.title,
          description: data.description,
          category: data.category || null,
          priority: data.priority ?? "MEDIUM",
          requesterId: requester?.id,
          requesterEmail,
          requesterName,
        },
      });
      await tx.message.create({
        data: {
          ticketId: ticket.id,
          authorId: requester?.id,
          authorEmail: requester ? null : requesterEmail,
          content: data.description,
          channel: input.channel,
          externalId: input.messageExternalId,
        },
      });
      await recordAction(tx, {
        teamId: input.teamId, userId: actor.id, type: "ticket.create", targetType: "ticket", targetId: ticket.id,
        payload: { channel: input.channel, title: ticket.title, externalId: input.externalId ?? null },
      });
      if (input.createCard !== false) await createCardForTicket(tx, ticket, actor.id);

      await enqueue(tx, { teamId: input.teamId, type: "ticket.created", payload: { ticketId: ticket.id }, dedupeKey: `ticket.created:${ticket.id}` });
      return ticket;
    });
    return { ticket, created: true };
  } catch (err) {
    // Duas entregas simultâneas do mesmo evento: o índice único decide, a segunda devolve a primeira.
    if (input.externalId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.ticket.findFirst({ where: { teamId: input.teamId, channel: input.channel, externalId: input.externalId } });
      if (existing) return { ticket: existing, created: false };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Leitura

const ticketListSelect = {
  id: true, title: true, status: true, priority: true, category: true, channel: true, createdAt: true, updatedAt: true,
  requesterName: true, requesterEmail: true, triagedByAgent: true, resolvedByAgent: true,
  card: { select: { id: true, boardId: true, assignee: { select: { id: true, name: true } } } },
} satisfies Prisma.TicketSelect;

export const ticketFiltersSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED", "ACTIVE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(200).optional(),
  mine: z.literal("1").optional(),
});

export async function listTickets(actor: Actor, filters: z.infer<typeof ticketFiltersSchema>) {
  assertCan(actor.role, "board:view");
  const where: Prisma.TicketWhereInput = {
    teamId: actor.teamId,
    // Conversas do chatbot que não passaram para um humano não entram na fila.
    OR: [{ channel: { not: "CHAT" } }, { handoffAt: { not: null } }, { card: { isNot: null } }],
  };
  if (filters.status === "ACTIVE") where.status = { in: OPEN_STATUSES };
  else if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.category) where.category = filters.category;
  if (filters.mine) where.card = { assigneeId: actor.id };
  if (filters.q) {
    where.AND = [{ OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { description: { contains: filters.q, mode: "insensitive" } }, { requesterEmail: { contains: filters.q, mode: "insensitive" } }] }];
  }
  return db.ticket.findMany({ where, select: ticketListSelect, orderBy: [{ createdAt: "desc" }], take: 200 });
}

export async function listRequesterTickets(userId: string) {
  return db.ticket.findMany({ where: { requesterId: userId }, select: ticketListSelect, orderBy: { createdAt: "desc" }, take: 100 });
}

const ticketDetailInclude = {
  requester: { select: { id: true, name: true, email: true } },
  suggestedAssignee: { select: { id: true, name: true } },
  card: { select: { id: true, boardId: true, columnId: true, column: { select: { name: true } }, assignee: { select: { id: true, name: true } } } },
  messages: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true, content: true, internal: true, channel: true, createdAt: true, authorEmail: true,
      author: { select: { id: true, name: true, role: true } },
      agent: { select: { id: true, type: true } },
    },
  },
} satisfies Prisma.TicketInclude;

export async function getTicketForStaff(actor: Actor, ticketId: string) {
  assertCan(actor.role, "board:view");
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId }, include: ticketDetailInclude });
  if (!ticket) throw new NotFoundError("Chamado");
  return ticket;
}

/** Visão do solicitante: sem notas internas. */
export async function getTicketForRequester(where: { id: string; requesterId: string } | { accessToken: string }) {
  const ticket = await db.ticket.findFirst({ where, include: ticketDetailInclude });
  if (!ticket) throw new NotFoundError("Chamado");
  return { ...ticket, messages: ticket.messages.filter((m) => !m.internal) };
}

export type StaffTicket = Awaited<ReturnType<typeof getTicketForStaff>>;
export type TicketMessage = StaffTicket["messages"][number];

// ---------------------------------------------------------------------------
// Conversa

const replySchema = z.object({
  ticketId: z.string().min(1),
  content: z.string().trim().min(1, "Escreva a mensagem").max(20_000),
  internal: z.boolean().default(false),
});

/** Resposta da equipe. Mensagens públicas vão ao solicitante pelo canal de origem. */
export async function replyToTicket(actor: Actor, input: z.input<typeof replySchema>) {
  assertCan(actor.role, "card:edit");
  const data = replySchema.parse(input);
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { id: data.ticketId, teamId: actor.teamId } });
    if (!ticket) throw new NotFoundError("Chamado");
    const message = await tx.message.create({
      data: { ticketId: ticket.id, authorId: actor.id, content: data.content, channel: ticket.channel, internal: data.internal },
    });
    if (!data.internal) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { firstResponseAt: ticket.firstResponseAt ?? new Date(), ...(ticket.status === "OPEN" && { status: "IN_PROGRESS" }) },
      });
      await enqueue(tx, { teamId: ticket.teamId, type: "notify.requester", payload: { messageId: message.id } });
    }
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: data.internal ? "ticket.note" : "ticket.reply", targetType: "ticket", targetId: ticket.id,
      payload: { messageId: message.id },
    });
    return message;
  });
}

/**
 * Mensagem do solicitante (portal, link de acompanhamento, e-mail, Slack).
 * Reabre o chamado se ele já estava resolvido.
 */
export async function addRequesterMessage(
  ticketId: string,
  author: { userId: string } | { email: string },
  content: string,
  options: { channel?: Channel; externalId?: string } = {},
) {
  const text = z.string().trim().min(1).max(20_000).parse(content);
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundError("Chamado");
    if (options.externalId) {
      const duplicate = await tx.message.findFirst({ where: { ticketId, externalId: options.externalId } });
      if (duplicate) return duplicate;
    }
    const user = "userId" in author ? await tx.user.findUnique({ where: { id: author.userId } }) : null;
    if ("userId" in author && user?.id !== ticket.requesterId) throw new ForbiddenError("ticket:create");

    const message = await tx.message.create({
      data: {
        ticketId,
        authorId: user?.id,
        authorEmail: user ? null : (author as { email: string }).email,
        content: text,
        channel: options.channel ?? ticket.channel,
        externalId: options.externalId,
      },
    });
    const actor = user ?? (ticket.requesterId ? { id: ticket.requesterId } : await getSystemUser(tx, ticket.teamId));
    await recordAction(tx, {
      teamId: ticket.teamId, userId: actor.id, type: "ticket.requester_message", targetType: "ticket", targetId: ticket.id,
      payload: { messageId: message.id },
    });
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED" || ticket.status === "WAITING") {
      await applyStatus(tx, ticket, "OPEN", actor.id, { moveCard: true, notify: false });
    }
    await enqueue(tx, { teamId: ticket.teamId, type: "ticket.requester_message", payload: { ticketId, messageId: message.id } });
    return message;
  });
}

// ---------------------------------------------------------------------------
// Status

/**
 * Aplica um status ao chamado dentro da transação: grava, registra, avisa o
 * solicitante e, se pedido, leva o cartão para a coluna ligada ao status.
 */
export async function applyStatus(
  tx: Tx,
  ticket: { id: string; teamId: string; status: TicketStatus; channel: Channel; resolvedAt: Date | null },
  status: TicketStatus,
  actorId: string,
  options: { moveCard: boolean; notify?: boolean; byAgent?: boolean },
) {
  if (ticket.status === status) return;
  const resolved = status === "RESOLVED" || status === "CLOSED";
  await tx.ticket.update({
    where: { id: ticket.id },
    data: {
      status,
      resolvedAt: resolved ? (ticket.resolvedAt ?? new Date()) : null,
      ...(resolved && options.byAgent !== undefined && { resolvedByAgent: options.byAgent }),
    },
  });
  await recordAction(tx, {
    teamId: ticket.teamId, userId: actorId, type: "ticket.status", targetType: "ticket", targetId: ticket.id,
    payload: { from: ticket.status, to: status },
  });

  if (options.moveCard) {
    const card = await tx.card.findUnique({ where: { ticketId: ticket.id } });
    if (card && !card.archivedAt) {
      const column = await tx.column.findFirst({ where: { boardId: card.boardId, ticketStatus: status }, orderBy: { position: "asc" } });
      if (column && column.id !== card.columnId) {
        const last = await tx.card.findFirst({ where: { columnId: column.id, archivedAt: null }, orderBy: { position: "desc" } });
        await tx.card.update({ where: { id: card.id }, data: { columnId: column.id, position: positionAt(last ? [last] : [], 1) } });
        await recordAction(tx, {
          teamId: ticket.teamId, userId: actorId, type: "card.move", targetType: "card", targetId: card.id,
          payload: { fromColumnId: card.columnId, toColumnId: column.id, reason: "ticket.status" },
        });
      }
    }
  }

  // Mensagem de sistema visível ao solicitante, enviada pelo canal de origem.
  if (options.notify !== false) {
    const message = await tx.message.create({
      data: { ticketId: ticket.id, content: `Status do chamado: ${STATUS_LABELS[status]}.`, channel: ticket.channel },
    });
    await enqueue(tx, { teamId: ticket.teamId, type: "notify.requester", payload: { messageId: message.id } });
  }
}

const statusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]),
});

export async function setTicketStatus(actor: Actor, input: z.input<typeof statusSchema>) {
  assertCan(actor.role, "card:move");
  const data = statusSchema.parse(input);
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { id: data.ticketId, teamId: actor.teamId } });
    if (!ticket) throw new NotFoundError("Chamado");
    await applyStatus(tx, ticket, data.status, actor.id, { moveCard: true, byAgent: false });
  });
}

const fieldsSchema = z.object({
  ticketId: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().trim().max(60).nullable().optional(),
});

export async function updateTicketFields(actor: Actor, input: z.input<typeof fieldsSchema>) {
  assertCan(actor.role, "card:prioritize");
  const { ticketId, ...fields } = fieldsSchema.parse(input);
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId } });
    if (!ticket) throw new NotFoundError("Chamado");
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (fields.priority && fields.priority !== ticket.priority) changes.priority = { from: ticket.priority, to: fields.priority };
    if (fields.category !== undefined && (fields.category || null) !== ticket.category) changes.category = { from: ticket.category, to: fields.category || null };
    if (Object.keys(changes).length === 0) return ticket;
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: { ...(changes.priority && { priority: fields.priority }), ...(changes.category && { category: fields.category || null }) },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "ticket.update", targetType: "ticket", targetId: ticket.id,
      payload: changes as Prisma.InputJsonValue,
    });
    return updated;
  });
}

/** Nota de satisfação (1 a 5) dada pelo solicitante depois da resolução. */
export async function rateTicket(where: { id: string; requesterId: string } | { accessToken: string }, score: number) {
  const value = z.number().int().min(1).max(5).parse(score);
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where });
    if (!ticket) throw new NotFoundError("Chamado");
    if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") throw new BusinessError("Só é possível avaliar chamados resolvidos");
    await tx.ticket.update({ where: { id: ticket.id }, data: { satisfaction: value } });
    const actorId = ticket.requesterId ?? (await getSystemUser(tx, ticket.teamId)).id;
    await recordAction(tx, {
      teamId: ticket.teamId, userId: actorId, type: "ticket.rate", targetType: "ticket", targetId: ticket.id, payload: { score: value },
    });
  });
}
