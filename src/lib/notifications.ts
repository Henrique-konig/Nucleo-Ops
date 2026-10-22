import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { appUrl, getIntegration, getIntegrationById } from "@/lib/integrations";
import { sendEmail, ticketSubject } from "@/lib/channels/email";
import { postSlackMessage } from "@/lib/channels/slack";
import { postTeamsMessage } from "@/lib/channels/teams";
import { postWebhookCallback } from "@/lib/channels/webhook";
import { PermanentJobError, type JobHandler } from "@/lib/jobs/queue";

// Entrega de mensagens ao solicitante pelo canal de origem do chamado (RF-07)
// e avisos ao canal da equipe no Slack/Teams.

/** Link de acompanhamento que não exige login. */
export function trackingUrl(ticket: { accessToken: string }) {
  return appUrl(`/acompanhar/${ticket.accessToken}`);
}

export const notifyRequesterJob: JobHandler = async (job) => {
  const { messageId } = z.object({ messageId: z.string() }).parse(job.payload);
  const message = await db.message.findUnique({
    where: { id: messageId },
    include: { ticket: { include: { requester: true } }, author: { select: { name: true } } },
  });
  if (!message) throw new PermanentJobError("Mensagem não existe mais");
  if (message.internal) return;
  const { ticket } = message;
  const from = message.author?.name ?? "Equipe de TI";
  const link = trackingUrl(ticket);

  switch (ticket.channel) {
    case "EMAIL": {
      const email = await getIntegration(ticket.teamId, "EMAIL");
      const to = ticket.requesterEmail ?? ticket.requester?.email;
      if (!email || !to) return;
      // Encadeia a resposta na conversa original quando o provedor informa o Message-ID.
      const lastInbound = await db.message.findFirst({
        where: { ticketId: ticket.id, externalId: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      await sendEmail(email.config, {
        to,
        subject: `Re: ${ticketSubject(ticket)}`,
        text: `${message.content}\n\n— ${from}\n\nAcompanhe o chamado: ${link}\nResponda a este e-mail para continuar a conversa.`,
        inReplyTo: lastInbound?.externalId ?? undefined,
      });
      return;
    }
    case "SLACK": {
      const slack = await getIntegration(ticket.teamId, "SLACK");
      const slackUser = ticket.requester?.slackUserId;
      if (!slack || !slackUser) return;
      await postSlackMessage(slack.config, slackUser, `*${ticket.title}* (#${ticket.id.slice(-8)})\n${message.content}\n<${link}|Acompanhar chamado>`);
      return;
    }
    case "TEAMS": {
      const teams = await getIntegration(ticket.teamId, "TEAMS");
      if (!teams) return;
      const who = ticket.requesterName ?? ticket.requesterEmail ?? "solicitante";
      await postTeamsMessage(teams.config, `**${ticket.title}** (#${ticket.id.slice(-8)}) para ${who}\n\n${message.content}\n\n[Acompanhar chamado](${link})`);
      return;
    }
    case "WEBHOOK": {
      // externalId = "<integração>:<id no sistema de origem>"
      const [integrationId, sourceId] = (ticket.externalId ?? "").split(":");
      const hook = integrationId ? await getIntegrationById(integrationId, "WEBHOOK") : null;
      if (!hook) return;
      await postWebhookCallback(hook.config, {
        event: "ticket.message",
        ticketId: ticket.id,
        sourceId,
        status: ticket.status,
        message: message.content,
        trackingUrl: link,
      });
      return;
    }
    case "FORM":
    case "CHAT":
      // O solicitante acompanha pelo portal, onde a mensagem já aparece.
      return;
  }
};

export const notifyTeamJob: JobHandler = async (job) => {
  const { text, cardId, ticketId } = z
    .object({ text: z.string(), cardId: z.string().optional(), ticketId: z.string().optional() })
    .parse(job.payload);
  const card = cardId ? await db.card.findUnique({ where: { id: cardId }, select: { boardId: true } }) : null;
  const link = card ? appUrl(`/boards/${card.boardId}`) : ticketId ? appUrl(`/chamados/${ticketId}`) : appUrl("/");
  const [slack, teams] = await Promise.all([getIntegration(job.teamId, "SLACK"), getIntegration(job.teamId, "TEAMS")]);
  const sends: Promise<void>[] = [];
  if (slack) sends.push(postSlackMessage(slack.config, slack.config.channelId, `${text}\n<${link}|Abrir no Plantão>`));
  if (teams) sends.push(postTeamsMessage(teams.config, `${text}\n\n[Abrir no Plantão](${link})`));
  const results = await Promise.allSettled(sends);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
};
