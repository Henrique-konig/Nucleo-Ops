"use server";

import { runAction } from "@/lib/action-result";
import { decideExecution, proposeExecution, requestExecutionSuggestion } from "@/lib/execution/service";

const PAGES = ["/execucoes", "/chamados/[ticketId]"];

export async function approveExecution(id: string) {
  return runAction((user) => decideExecution(user, id, true), PAGES);
}

export async function rejectExecution(id: string) {
  return runAction((user) => decideExecution(user, id, false), PAGES);
}

export async function proposeExecutionAction(ticketId: string, fd: FormData) {
  return runAction(async (user) => {
    const actionKey = String(fd.get("actionKey") ?? "");
    const params: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("param.") && String(v).trim()) params[k.slice(6)] = String(v).trim();
    await proposeExecution(user, { ticketId, actionKey, params, reason: String(fd.get("reason") ?? "") || undefined });
  }, PAGES);
}

export async function suggestExecutionAction(ticketId: string) {
  return runAction((user) => requestExecutionSuggestion(user, ticketId), PAGES);
}
