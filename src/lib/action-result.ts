import "server-only";
import { revalidatePath } from "next/cache";
import { currentUser, type CurrentUser } from "@/lib/session";
import { errorMessage } from "@/lib/error-message";
import { kickJobs } from "@/lib/jobs/run";

export { errorMessage };

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

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
