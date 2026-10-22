import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai";
import { recordAiUsage } from "@/lib/ai/budget";
import { recordAction } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { searchDocuments } from "@/lib/knowledge";
import { assertCanRun, loadAgent, recordAgentFailure, recordAgentSuccess } from "@/lib/agents/guard";
import { createCardForTicket, createTicket, STATUS_LABELS } from "@/lib/tickets";
import { BusinessError, NotFoundError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";

// Chatbot de primeiro nível. Cada conversa é um chamado do canal CHAT que só
// ganha cartão no quadro quando passa para um humano (handoff), já com todo o
// contexto da conversa. Se o solicitante disser que resolveu, o chamado conta
// como resolvido pelo assistente.

const CONVERSATION_IDLE_MS = 24 * 3_600_000;

type Requester = Pick<CurrentUser, "id" | "teamId" | "name">;

/** Conversa em andamento: chamado de chat sem handoff, aberto e recente. */
export async function getActiveConversation(requester: Requester) {
  return db.ticket.findFirst({
    where: {
      requesterId: requester.id,
      channel: "CHAT",
      handoffAt: null,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      updatedAt: { gte: new Date(Date.now() - CONVERSATION_IDLE_MS) },
    },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" }, select: { id: true, content: true, authorId: true, agentId: true, createdAt: true } } },
  });
}

async function handoff(ticketId: string, actorId: string, title: string | null) {
  await db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (ticket.handoffAt) return;
    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: { handoffAt: new Date(), ...(title && { title: title.slice(0, 200) }) },
    });
    await createCardForTicket(tx, updated, actorId);
    await tx.message.create({
      data: { ticketId, channel: "CHAT", content: "Conversa encaminhada para a equipe de TI. Você será avisado por aqui." },
    });
    await recordAction(tx, { teamId: ticket.teamId, userId: actorId, type: "chat.handoff", targetType: "ticket", targetId: ticketId });
    await enqueue(tx, { teamId: ticket.teamId, type: "ticket.handoff", payload: { ticketId } });
  });
}

const messageSchema = z.string().trim().min(1, "Escreva sua mensagem").max(4000);

/** Mensagem do solicitante ao assistente. Responde na hora (sem fila) para a conversa fluir. */
export async function sendChatMessage(requester: Requester, text: string) {
  const content = messageSchema.parse(text);
  let conversation = await getActiveConversation(requester);
  if (!conversation) {
    const { ticket } = await createTicket({
      teamId: requester.teamId,
      channel: "CHAT",
      title: content.length > 80 ? `${content.slice(0, 77)}…` : content.length >= 3 ? content : `Conversa: ${content}`,
      description: content.length >= 5 ? content : `${content} (conversa com o assistente)`,
      requester: { userId: requester.id },
      createCard: false,
    });
    conversation = (await getActiveConversation(requester))!;
    if (!conversation || conversation.id !== ticket.id) throw new BusinessError("Não foi possível iniciar a conversa");
  } else {
    await db.message.create({ data: { ticketId: conversation.id, authorId: requester.id, content, channel: "CHAT" } });
  }
  const ticketId = conversation.id;

  const agent = await loadAgent(requester.teamId, "CHATBOT");
  if (!agent) {
    await handoff(ticketId, requester.id, null);
    return { ticketId, handoff: true };
  }

  try {
    await assertCanRun(agent);
    const [sources, myTickets, history] = await Promise.all([
      searchDocuments(requester.teamId, content, 4),
      db.ticket.findMany({
        where: { requesterId: requester.id, id: { not: ticketId }, OR: [{ channel: { not: "CHAT" } }, { handoffAt: { not: null } }] },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true },
      }),
      db.message.findMany({ where: { ticketId, internal: false }, orderBy: { createdAt: "asc" }, take: 20 }),
    ]);
    const { data, usage } = await getAiProvider().chat({
      question: content,
      history: history
        .slice(0, -1)
        .filter((m) => m.authorId || m.agentId)
        .map((m) => ({ from: m.agentId ? "assistente" : "solicitante", content: m.content })),
      sources,
      requesterTickets: myTickets.map((t) => ({ ...t, status: STATUS_LABELS[t.status] })),
    });

    await db.$transaction(async (tx) => {
      await recordAiUsage(tx, { teamId: requester.teamId, agentId: agent.id, ticketId, purpose: "chat", usage });
      await tx.message.create({ data: { ticketId, agentId: agent.id, content: data.answer, channel: "CHAT" } });
      await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: conversation.firstResponseAt ?? new Date() } });
      await recordAction(tx, {
        teamId: requester.teamId, agentId: agent.id, type: "chat.answer", targetType: "ticket", targetId: ticketId,
        payload: { sources: data.usedSourceIds, handoff: data.handoff },
      });
    });
    await recordAgentSuccess(agent.id);
    if (data.handoff) await handoff(ticketId, requester.id, data.handoffTitle);
    return { ticketId, handoff: data.handoff };
  } catch (err) {
    // Assistente indisponível (falha, limite, teto de custo): a conversa vai para a equipe.
    await recordAgentFailure(agent.id, err);
    console.error("[chatbot]", err);
    await handoff(ticketId, requester.id, null);
    return { ticketId, handoff: true };
  }
}

/** "Resolveu" — conta como chamado resolvido pelo assistente. */
export async function resolveConversation(requester: Requester, ticketId: string) {
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { id: ticketId, requesterId: requester.id, channel: "CHAT", handoffAt: null } });
    if (!ticket) throw new NotFoundError("Conversa");
    await tx.ticket.update({ where: { id: ticketId }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByAgent: true } });
    await recordAction(tx, { teamId: ticket.teamId, userId: requester.id, type: "chat.resolved", targetType: "ticket", targetId: ticketId });
  });
}

/** "Falar com a equipe" — handoff pedido pelo solicitante. */
export async function requestHuman(requester: Requester, ticketId: string) {
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, requesterId: requester.id, channel: "CHAT" } });
  if (!ticket) throw new NotFoundError("Conversa");
  await handoff(ticketId, requester.id, null);
}
