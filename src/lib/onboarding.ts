import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/errors";

/** Marca a introdução do primeiro acesso como vista (concluída ou pulada). */
export async function finishOnboarding(actor: Actor) {
  await db.user.update({ where: { id: actor.id }, data: { onboardedAt: new Date() } });
}

/** Mostra a introdução de novo no próximo carregamento de página. */
export async function restartOnboarding(actor: Actor) {
  await db.user.update({ where: { id: actor.id }, data: { onboardedAt: null } });
}
