import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { currentUser, type CurrentUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/permissions";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";
import { kickJobs } from "@/lib/jobs/run";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export function errorMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Dados inválidos";
  if (err instanceof ForbiddenError) return "Você não tem permissão para esta ação";
  if (err instanceof NotFoundError || err instanceof BusinessError) return err.message;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "Já existe um item com esses dados";
  console.error(err);
  return "Não foi possível concluir a ação";
}

/**
 * Executa uma server action com o usuário da sessão, converte erros em mensagens
 * para a interface, revalida as páginas e processa a fila de tarefas em seguida.
 */
export async function runAction<T>(
  fn: (user: CurrentUser) => Promise<T>,
  revalidate: string[] = [],
): Promise<ActionResult<T>> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sessão expirada, entre novamente" };
  try {
    const data = await fn(user);
    for (const path of revalidate) revalidatePath(path, "page");
    kickJobs();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Para ações públicas (link de acompanhamento), sem sessão. */
export async function runPublicAction<T>(fn: () => Promise<T>, revalidate: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const path of revalidate) revalidatePath(path, "page");
    kickJobs();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
