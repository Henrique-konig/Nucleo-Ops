import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { enqueue, type JobHandler } from "@/lib/jobs/queue";
import { shortId } from "@/lib/channels/email";
import { PRIORITY_LABELS } from "@/lib/tickets";

// Reações à abertura de um chamado: confirmação ao solicitante, aviso à equipe
// e, quando o agente está ativo, a triagem automática.

export const ticketCreatedJob: JobHandler = async (job) => {
  const { ticketId } = z.object({ ticketId: z.string() }).parse(job.payload);
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;

  await db.$transaction(async (tx) => {
    // Quem abriu por e-mail, webhook ou Slack recebe a confirmação com o link de acompanhamento.
    if (ticket.channel !== "FORM" && ticket.channel !== "CHAT") {
      const message = await tx.message.create({
        data: {
          ticketId: ticket.id,
          channel: ticket.channel,
          content: `Recebemos seu chamado "${ticket.title}" (#${shortId(ticket.id)}). Avisaremos por aqui a cada atualização.`,
        },
      });
      await enqueue(tx, { teamId: ticket.teamId, type: "notify.requester", payload: { messageId: message.id } });
    }

    const triage = await tx.agent.findUnique({ where: { teamId_type: { teamId: ticket.teamId, type: "TRIAGE" } } });
    if (triage?.active) {
      await enqueue(tx, { teamId: ticket.teamId, type: "agent.triage", payload: { ticketId }, dedupeKey: `agent.triage:${ticketId}` });
    } else if (ticket.channel !== "CHAT") {
      await enqueue(tx, {
        teamId: ticket.teamId,
        type: "notify.team",
        payload: { text: `Novo chamado: ${ticket.title} (prioridade ${PRIORITY_LABELS[ticket.priority].toLowerCase()})`, ticketId },
      });
    }
  });
};
