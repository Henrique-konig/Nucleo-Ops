"use server";

import { runAction } from "@/lib/action-result";
import { replyToTicket, setTicketStatus, updateTicketFields } from "@/lib/tickets";

const PAGES = ["/chamados/[ticketId]", "/chamados", "/boards/[boardId]"];

export async function reply(ticketId: string, fd: FormData) {
  return runAction(async (user) => {
    await replyToTicket(user, { ticketId, content: String(fd.get("content") ?? ""), internal: fd.get("internal") === "on" });
  }, PAGES);
}

export async function changeStatus(ticketId: string, fd: FormData) {
  return runAction((user) => setTicketStatus(user, { ticketId, status: String(fd.get("status")) as never }), PAGES);
}

export async function changeFields(ticketId: string, fd: FormData) {
  return runAction(async (user) => {
    await updateTicketFields(user, { ticketId, priority: String(fd.get("priority")) as never, category: String(fd.get("category") ?? "") || null });
  }, PAGES);
}
