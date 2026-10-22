"use server";

import * as boards from "@/lib/boards";
import { runAction } from "@/lib/action-result";

// Gestão dos quadros (lista em /boards). Tudo é revalidado no serviço.
const PATHS = ["/boards", "/boards/[boardId]"];

export async function createBoardAction(input: unknown) {
  return runAction(async (a) => {
    const board = await boards.createBoard(a, input as never);
    return { id: board.id };
  }, PATHS);
}
export async function updateBoardAction(input: unknown) {
  return runAction(async (a) => { await boards.updateBoard(a, input as never); }, PATHS);
}
export async function setIntakeBoardAction(input: unknown) {
  return runAction((a) => boards.setIntakeBoard(a, input as never), PATHS);
}
export async function deleteBoardAction(input: unknown) {
  return runAction((a) => boards.deleteBoard(a, input as never), PATHS);
}
