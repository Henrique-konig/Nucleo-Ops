"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import * as boards from "@/lib/boards";
import { currentUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

function toMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Dados inválidos";
  if (err instanceof ForbiddenError) return "Você não tem permissão para esta ação";
  if (err instanceof boards.NotFoundError) return err.message;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "Já existe um item com esse nome";
  if (err instanceof Error && err.message.startsWith("Só é possível")) return err.message;
  console.error(err);
  return "Não foi possível concluir a ação";
}

async function run<T>(fn: (actor: boards.Actor) => Promise<T>): Promise<ActionResult<T>> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sessão expirada, entre novamente" };
  try {
    const data = await fn(user);
    revalidatePath("/boards/[boardId]", "page");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

// Server actions recebem dados do cliente: tudo é revalidado no serviço.
export async function createCard(input: unknown) {
  return run(async (a) => { await boards.createCard(a, input as never); });
}
export async function moveCard(input: unknown) {
  return run(async (a) => { await boards.moveCard(a, input as never); });
}
export async function updateCard(input: unknown) {
  return run(async (a) => { await boards.updateCard(a, input as never); });
}
export async function archiveCard(input: unknown) {
  return run((a) => boards.archiveCard(a, input as never));
}
export async function addChecklistItem(input: unknown) {
  return run(async (a) => { await boards.addChecklistItem(a, input as never); });
}
export async function toggleChecklistItem(input: unknown) {
  return run(async (a) => { await boards.toggleChecklistItem(a, input as never); });
}
export async function deleteChecklistItem(input: unknown) {
  return run((a) => boards.deleteChecklistItem(a, input as never));
}
export async function createColumn(input: unknown) {
  return run(async (a) => { await boards.createColumn(a, input as never); });
}
export async function renameColumn(input: unknown) {
  return run(async (a) => { await boards.renameColumn(a, input as never); });
}
export async function moveColumn(input: unknown) {
  return run((a) => boards.moveColumn(a, input as never));
}
export async function deleteColumn(input: unknown) {
  return run((a) => boards.deleteColumn(a, input as never));
}
export async function createLabel(input: unknown) {
  return run(async (a) => {
    const label = await boards.createLabel(a, input as never);
    return { id: label.id, name: label.name, color: label.color };
  });
}
