import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { enqueue, type JobHandler } from "@/lib/jobs/queue";
import { shortId } from "@/lib/channels/email";
import { PRIORITY_LABELS } from "@/lib/tickets";
import type { Prisma } from "@/generated/prisma/client";

// Reações à chegada de um chamado na fila da equipe: confirmação ao solicitante,
// aviso à equipe e, quando o agente está ativo, a triagem automática.

async function routeToTeam(tx: Prisma.TransactionClient, ticket: { id: string; teamId: string; title: string; priority: keyof typeof PRIORITY_LABELS }) {
  const triage = await tx.agent.findUnique({ where: { teamId_type: { teamId: ticket.teamId, type: "TRIAGE" } } });
  if (triage?.active && !triage.pausedReason) {
    // A triagem avisa a equipe já com categoria e prioridade.
    await enqueue(tx, { teamId: ticket.teamId, type: "agent.triage", payload: { ticketId: ticket.id }, dedupeKey: `agent.triage:${ticket.id}` });
  } else {
    await enqueue(tx, {
      teamId: ticket.teamId,
      type: "notify.team",
      payload: { text: `Novo chamado: ${ticket.title} (prioridade ${PRIORITY_LABELS[ticket.priority].toLowerCase()})`, ticketId: ticket.id },
    });
  }
}

export const ticketCreatedJob: JobHandler = async (job) => {
  const { ticketId } = z.object({ ticketId: z.string() }).parse(job.payload);
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  // Conversas do chatbot só entram na fila no handoff.
  if (!ticket || ticket.channel === "CHAT") return;

  await db.$transaction(async (tx) => {
    // Quem abriu por e-mail, webhook ou Slack recebe a confirmação com o link de acompanhamento.
    if (ticket.channel !== "FORM") {
      const message = await tx.message.create({
        data: {
          ticketId: ticket.id,
          channel: ticket.channel,
          content: `Recebemos seu chamado "${ticket.title}" (#${shortId(ticket.id)}). Avisaremos por aqui a cada atualização.`,
        },
      });
      await enqueue(tx, { teamId: ticket.teamId, type: "notify.requester", payload: { messageId: message.id } });
    }
    await routeToTeam(tx, ticket);
  });
};

export const ticketHandoffJob: JobHandler = async (job) => {
  const { ticketId } = z.object({ ticketId: z.string() }).parse(job.payload);
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  await db.$transaction((tx) => routeToTeam(tx, ticket));
};
