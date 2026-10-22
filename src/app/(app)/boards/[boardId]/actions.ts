"use server";

import * as boards from "@/lib/boards";
import { runAction, type ActionResult } from "@/lib/action-result";
import { linkCard, unlinkCard } from "@/lib/code-links";
import { listCardRuns, requestAgentRun } from "@/lib/custom-agents";
import * as collaboration from "@/lib/collaboration";

export type { ActionResult };

const BOARD = ["/boards/[boardId]"];

// Server actions recebem dados do cliente: tudo é revalidado no serviço.
export async function createCard(input: unknown) {
  return runAction(async (a) => { await boards.createCard(a, input as never); }, BOARD);
}
export async function moveCard(input: unknown) {
  return runAction(async (a) => { await boards.moveCard(a, input as never); }, BOARD);
}
export async function updateCard(input: unknown) {
  return runAction(async (a) => { await boards.updateCard(a, input as never); }, BOARD);
}
export async function archiveCard(input: unknown) {
  return runAction((a) => boards.archiveCard(a, input as never), BOARD);
}
export async function addChecklistItem(input: unknown) {
  return runAction(async (a) => { await boards.addChecklistItem(a, input as never); }, BOARD);
}
export async function toggleChecklistItem(input: unknown) {
  return runAction(async (a) => { await boards.toggleChecklistItem(a, input as never); }, BOARD);
}
export async function deleteChecklistItem(input: unknown) {
  return runAction((a) => boards.deleteChecklistItem(a, input as never), BOARD);
}
export async function createColumn(input: unknown) {
  return runAction(async (a) => { await boards.createColumn(a, input as never); }, BOARD);
}
export async function renameColumn(input: unknown) {
  return runAction(async (a) => { await boards.renameColumn(a, input as never); }, BOARD);
}
export async function moveColumn(input: unknown) {
  return runAction((a) => boards.moveColumn(a, input as never), BOARD);
}
export async function deleteColumn(input: unknown) {
  return runAction((a) => boards.deleteColumn(a, input as never), BOARD);
}
export async function setColumnTicketStatus(input: unknown) {
  return runAction((a) => boards.setColumnTicketStatus(a, input as never), BOARD);
}
export async function createLabel(input: unknown) {
  return runAction(async (a) => {
    const label = await boards.createLabel(a, input as never);
    return { id: label.id, name: label.name, color: label.color };
  }, BOARD);
}

export async function linkCardAction(input: { cardId: string; url: string }) {
  return runAction((a) => linkCard(a, input.cardId, input.url), BOARD);
}
export async function unlinkCardAction(linkId: string) {
  return runAction((a) => unlinkCard(a, linkId), BOARD);
}

export async function moveCardToBoard(input: unknown) {
  return runAction(async (a) => { await boards.moveCardToBoard(a, input as never); }, ["/boards/[boardId]"]);
}

export async function saveFilter(input: unknown) {
  return runAction((a) => boards.saveFilter(a, input as never), BOARD);
}
export async function deleteFilter(input: unknown) {
  return runAction((a) => boards.deleteFilter(a, input as never), BOARD);
}

export async function runAgent(input: unknown) {
  return runAction((a) => requestAgentRun(a, input as never), BOARD);
}
// Leitura sob demanda do histórico do agente no cartão aberto.
export async function cardAgentRuns(cardId: string) {
  return runAction((a) => listCardRuns(a, cardId));
}

// Colaboração: comentários, anexos e detalhes do cartão (carregados ao abrir o diálogo).
export async function getCardDetailsAction(cardId: string) {
  return runAction((a) => collaboration.getCardDetails(a, cardId));
}
export async function addCommentAction(input: unknown) {
  return runAction(async (a) => { await collaboration.addComment(a, input as never); }, BOARD);
}
export async function editCommentAction(input: unknown) {
  return runAction(async (a) => { await collaboration.editComment(a, input as never); });
}
export async function deleteCommentAction(input: unknown) {
  return runAction((a) => collaboration.deleteComment(a, input as never), BOARD);
}
export async function uploadAttachmentAction(formData: FormData) {
  return runAction(async (a) => {
    await collaboration.addAttachment(a, String(formData.get("cardId") ?? ""), formData.get("file") as File);
  }, BOARD);
}
export async function deleteAttachmentAction(input: unknown) {
  return runAction((a) => collaboration.deleteAttachment(a, input as never), BOARD);
}
