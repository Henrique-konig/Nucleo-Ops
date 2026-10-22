"use server";

import { runAction } from "@/lib/action-result";
import { replyToTicket, setTicketStatus, updateTicketFields } from "@/lib/tickets";
import { acceptSuggestedAssignee, undoTriage } from "@/lib/agents/triage";
import { discardDraft, requestDraft, sendDraft } from "@/lib/agents/research";

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

export async function undoTriageAction(ticketId: string) {
  return runAction((user) => undoTriage(user, ticketId), PAGES);
}

export async function acceptAssigneeAction(ticketId: string) {
  return runAction((user) => acceptSuggestedAssignee(user, ticketId), PAGES);
}

export async function requestDraftAction(ticketId: string) {
  return runAction((user) => requestDraft(user, ticketId), PAGES);
}

export async function sendDraftAction(draftId: string, fd: FormData) {
  return runAction((user) => sendDraft(user, { draftId, content: String(fd.get("content") ?? "") }), PAGES);
}

export async function discardDraftAction(draftId: string) {
  return runAction((user) => discardDraft(user, draftId), PAGES);
}
