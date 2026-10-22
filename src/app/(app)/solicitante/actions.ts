"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/lib/action-result";
import { addRequesterMessage, createTicket, rateTicket } from "@/lib/tickets";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requestHuman, resolveConversation, sendChatMessage } from "@/lib/chatbot";

export async function openTicket(fd: FormData) {
  const result = await runAction(async (user) => {
    assertCan(user.role, "ticket:create");
    const { ticket } = await createTicket({
      teamId: user.teamId,
      channel: "FORM",
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      category: String(fd.get("category") ?? "") || null,
      requester: { userId: user.id },
    });
    return ticket.id;
  }, ["/solicitante"]);
  if (result.ok) redirect(`/solicitante/chamados/${result.data}`);
  return result;
}

async function ownTicket(userId: string, ticketId: string) {
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, requesterId: userId }, select: { id: true } });
  if (!ticket) throw new NotFoundError("Chamado");
  return ticket;
}

export async function sendRequesterMessage(ticketId: string, fd: FormData) {
  return runAction(async (user) => {
    await ownTicket(user.id, ticketId);
    await addRequesterMessage(ticketId, { userId: user.id }, String(fd.get("content") ?? ""));
  }, ["/solicitante/chamados/[ticketId]"]);
}

export async function rateOwnTicket(ticketId: string, fd: FormData) {
  return runAction((user) => rateTicket({ id: ticketId, requesterId: user.id }, Number(fd.get("score"))), ["/solicitante/chamados/[ticketId]"]);
}

export async function chatSend(fd: FormData) {
  return runAction(async (user) => {
    assertCan(user.role, "ticket:create");
    return sendChatMessage(user, String(fd.get("content") ?? ""));
  }, ["/solicitante"]);
}

export async function chatResolve(ticketId: string) {
  return runAction((user) => resolveConversation(user, ticketId), ["/solicitante"]);
}

export async function chatHuman(ticketId: string) {
  return runAction((user) => requestHuman(user, ticketId), ["/solicitante"]);
}
