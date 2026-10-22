import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai";
import { recordAiUsage } from "@/lib/ai/budget";
import { enqueue, type JobHandler } from "@/lib/jobs/queue";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { searchDocuments, searchSimilarTickets } from "@/lib/knowledge";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";
import { assertCanRun, loadAgent, recordAgentFailure, recordAgentSuccess } from "./guard";
import type { Prisma } from "@/generated/prisma/client";

// Agente de pesquisa (RF-05): consulta a base de conhecimento e chamados parecidos
// e propõe uma resposta com fontes. Escreve só o rascunho; um técnico revisa e envia.

export const researchJob: JobHandler = async (job) => {
  const { ticketId } = z.object({ ticketId: z.string() }).parse(job.payload);
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { messages: { where: { internal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true } } } } },
  });
  if (!ticket) return;
  const agent = await loadAgent(ticket.teamId, "RESEARCH");
  if (!agent) return;

  try {
    await assertCanRun(agent);
    const lastRequesterText = [...ticket.messages].reverse().find((m) => m.authorId === ticket.requesterId || m.authorEmail)?.content ?? "";
    const query = `${ticket.title}\n${ticket.description}\n${lastRequesterText}`;
    const [documents, similar] = await Promise.all([searchDocuments(ticket.teamId, query, 5), searchSimilarTickets(ticket.teamId, query, ticket.id, 3)]);
    const sources = [...documents, ...similar];

    const { data, usage } = await getAiProvider().draftReply({
      ticket: { title: ticket.title, description: ticket.description },
      conversation: ticket.messages
        .filter((m) => m.authorId || m.authorEmail)
        .map((m) => ({ from: m.authorId === ticket.requesterId || m.authorEmail ? "solicitante" : "equipe", content: m.content })),
      sources,
    });
    const used = sources.filter((s) => data.usedSourceIds.includes(s.id)).map(({ type, id, title }) => ({ type, id, title }));

    await db.$transaction(async (tx) => {
      await recordAiUsage(tx, { teamId: ticket.teamId, agentId: agent.id, ticketId, purpose: "research", usage });
      // Um rascunho pendente por vez: o novo substitui o anterior.
      await tx.replyDraft.updateMany({ where: { ticketId, status: "PENDING" }, data: { status: "DISCARDED" } });
      const draft = await tx.replyDraft.create({
        data: { ticketId, agentId: agent.id, content: data.reply, sources: used as Prisma.InputJsonValue },
      });
      await recordAction(tx, {
        teamId: ticket.teamId, agentId: agent.id, type: "draft.create", targetType: "draft", targetId: draft.id,
        payload: { ticketId, sources: used.length, confident: data.confident },
      });
    });
    await recordAgentSuccess(agent.id);
  } catch (err) {
    await recordAgentFailure(agent.id, err);
    throw err;
  }
};

/** Pedido manual de rascunho pela tela do chamado. */
export async function requestDraft(actor: Actor, ticketId: string) {
  assertCan(actor.role, "ai:use");
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId } });
  if (!ticket) throw new NotFoundError("Chamado");
  const agent = await loadAgent(actor.teamId, "RESEARCH");
  if (!agent) throw new BusinessError("O agente de pesquisa está desativado");
  await db.$transaction(async (tx) => {
    await enqueue(tx, { teamId: actor.teamId, type: "agent.research", payload: { ticketId } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "draft.request", targetType: "ticket", targetId: ticketId });
  });
}

const sendSchema = z.object({ draftId: z.string(), content: z.string().trim().min(1, "A resposta está vazia").max(20_000) });

/** O técnico revisa (pode editar) e envia o rascunho como resposta sua. */
export async function sendDraft(actor: Actor, input: z.input<typeof sendSchema>) {
  assertCan(actor.role, "card:edit");
  const data = sendSchema.parse(input);
  return db.$transaction(async (tx) => {
    const draft = await tx.replyDraft.findFirst({ where: { id: data.draftId, ticket: { teamId: actor.teamId } }, include: { ticket: true } });
    if (!draft) throw new NotFoundError("Rascunho");
    if (draft.status !== "PENDING") throw new BusinessError("Este rascunho já foi usado ou descartado");
    const message = await tx.message.create({ data: { ticketId: draft.ticketId, authorId: actor.id, content: data.content, channel: draft.ticket.channel } });
    await tx.replyDraft.update({ where: { id: draft.id }, data: { status: "SENT", reviewedById: actor.id, reviewedAt: new Date() } });
    await tx.ticket.update({
      where: { id: draft.ticketId },
      data: { firstResponseAt: draft.ticket.firstResponseAt ?? new Date(), ...(draft.ticket.status === "OPEN" && { status: "IN_PROGRESS" }) },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "draft.send", targetType: "draft", targetId: draft.id,
      payload: { ticketId: draft.ticketId, messageId: message.id, edited: data.content !== draft.content },
    });
    await enqueue(tx, { teamId: actor.teamId, type: "notify.requester", payload: { messageId: message.id } });
  });
}

export async function discardDraft(actor: Actor, draftId: string) {
  assertCan(actor.role, "card:edit");
  return db.$transaction(async (tx) => {
    const draft = await tx.replyDraft.findFirst({ where: { id: draftId, ticket: { teamId: actor.teamId }, status: "PENDING" } });
    if (!draft) throw new NotFoundError("Rascunho");
    await tx.replyDraft.update({ where: { id: draftId }, data: { status: "DISCARDED", reviewedById: actor.id, reviewedAt: new Date() } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "draft.discard", targetType: "draft", targetId: draftId, payload: { ticketId: draft.ticketId } });
  });
}
