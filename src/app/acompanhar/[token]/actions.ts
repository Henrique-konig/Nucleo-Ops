"use server";

import { runPublicAction } from "@/lib/action-result";
import { addRequesterMessage, rateTicket } from "@/lib/tickets";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

// O token do link de acompanhamento é a credencial: quem tem o link fala pelo solicitante.
async function byToken(token: string) {
  const ticket = await db.ticket.findUnique({ where: { accessToken: token }, select: { id: true, requesterId: true, requesterEmail: true } });
  if (!ticket) throw new NotFoundError("Chamado");
  return ticket;
}

export async function sendTrackedMessage(token: string, fd: FormData) {
  return runPublicAction(async () => {
    const ticket = await byToken(token);
    const author = ticket.requesterId ? { userId: ticket.requesterId } : { email: ticket.requesterEmail ?? "solicitante" };
    await addRequesterMessage(ticket.id, author, String(fd.get("content") ?? ""));
  }, ["/acompanhar/[token]"]);
}

export async function rateTrackedTicket(token: string, fd: FormData) {
  return runPublicAction(() => rateTicket({ accessToken: token }, Number(fd.get("score"))), ["/acompanhar/[token]"]);
}
