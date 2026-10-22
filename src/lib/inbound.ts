import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { addRequesterMessage, createTicket } from "@/lib/tickets";
import { shortIdFromSubject, stripQuotedReply } from "@/lib/channels/email";

// Normalização dos e-mails recebidos. Aceita o formato genérico do Plantão e o
// webhook de entrada do Postmark; outros provedores podem mapear para o genérico.

const genericEmail = z.object({
  from: z.object({ email: z.email(), name: z.string().optional() }),
  subject: z.string().default(""),
  text: z.string().default(""),
  messageId: z.string().min(1),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
});

const postmarkEmail = z.object({
  FromFull: z.object({ Email: z.email(), Name: z.string().optional() }),
  Subject: z.string().default(""),
  TextBody: z.string().default(""),
  StrippedTextReply: z.string().optional(),
  MessageID: z.string().min(1),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).default([]),
});

export type InboundEmail = z.infer<typeof genericEmail>;

export function parseInboundEmail(body: unknown): InboundEmail {
  const pm = postmarkEmail.safeParse(body);
  if (pm.success) {
    const header = (name: string) => pm.data.Headers.find((h) => h.Name.toLowerCase() === name)?.Value;
    // O Message-ID real fica no cabeçalho; MessageID é o id interno do Postmark.
    return {
      from: { email: pm.data.FromFull.Email, name: pm.data.FromFull.Name },
      subject: pm.data.Subject,
      text: pm.data.StrippedTextReply || pm.data.TextBody,
      messageId: header("message-id") ?? pm.data.MessageID,
      inReplyTo: header("in-reply-to"),
      references: header("references")?.split(/\s+/).filter(Boolean),
    };
  }
  return genericEmail.parse(body);
}

/**
 * Chamado existente ao qual o e-mail responde, pelo assunto ou pelos cabeçalhos.
 * Só vale para o próprio solicitante; e-mail de outra pessoa abre um chamado novo.
 */
async function findThread(teamId: string, email: InboundEmail) {
  const ids = [email.inReplyTo, ...(email.references ?? [])].filter((v): v is string => Boolean(v));
  if (ids.length > 0) {
    const message = await db.message.findFirst({
      where: { externalId: { in: ids }, ticket: { teamId, requesterEmail: email.from.email.toLowerCase() } },
      select: { ticketId: true },
    });
    if (message) return message.ticketId;
  }
  const short = shortIdFromSubject(email.subject);
  if (short) {
    const ticket = await db.ticket.findFirst({ where: { teamId, id: { endsWith: short } }, select: { id: true, requesterEmail: true } });
    if (ticket && ticket.requesterEmail === email.from.email.toLowerCase()) return ticket.id;
  }
  return null;
}

export async function handleInboundEmail(teamId: string, email: InboundEmail) {
  const threadId = await findThread(teamId, email);
  const text = stripQuotedReply(email.text) || email.text.trim();
  if (threadId) {
    const message = await addRequesterMessage(threadId, { email: email.from.email.toLowerCase() }, text || "(mensagem vazia)", {
      channel: "EMAIL",
      externalId: email.messageId,
    });
    return { ticketId: threadId, messageId: message.id, created: false };
  }
  const { ticket, created } = await createTicket({
    teamId,
    channel: "EMAIL",
    externalId: email.messageId,
    messageExternalId: email.messageId,
    title: (email.subject.replace(/^(re|fw|fwd|enc|res):\s*/i, "").trim() || "Chamado por e-mail").slice(0, 200),
    description: text.length >= 5 ? text : `${text} (sem descrição)`,
    requester: { email: email.from.email, name: email.from.name },
  });
  return { ticketId: ticket.id, created };
}

export const webhookTicketSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(3).max(200),
  description: z.string().min(5).max(20_000),
  requester: z.object({ email: z.email(), name: z.string().optional() }),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().max(60).optional(),
});
