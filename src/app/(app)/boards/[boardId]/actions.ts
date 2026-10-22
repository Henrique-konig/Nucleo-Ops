"use server";

import * as boards from "@/lib/boards";
import { runAction, type ActionResult } from "@/lib/action-result";

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
