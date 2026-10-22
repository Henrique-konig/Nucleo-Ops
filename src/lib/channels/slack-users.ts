import "server-only";
import { db } from "@/lib/db";
import { ensureRequester } from "@/lib/tickets";
import type { IntegrationConfig } from "@/lib/integrations";

/**
 * Usuário do Plantão para um usuário do Slack: pelo vínculo salvo ou pelo e-mail
 * do perfil no Slack (escopo users:read.email). Na primeira vez, guarda o vínculo.
 */
export async function resolveSlackUser(config: IntegrationConfig<"SLACK">, teamId: string, slackUserId: string) {
  const linked = await db.user.findFirst({ where: { slackUserId, teamId, active: true } });
  if (linked) return linked;

  type SlackUser = { ok: boolean; user?: { real_name?: string; profile?: { email?: string; real_name?: string } } };
  let data: SlackUser;
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
      headers: { Authorization: `Bearer ${config.botToken}` },
      signal: AbortSignal.timeout(2000),
    });
    data = (await res.json()) as SlackUser;
  } catch (err) {
    console.error("[slack] não foi possível consultar o usuário", err);
    return null;
  }
  const email = data.ok ? data.user?.profile?.email : undefined;
  if (!email) return null;

  return db.$transaction(async (tx) => {
    const user = await ensureRequester(tx, teamId, email, data.user?.profile?.real_name ?? data.user?.real_name);
    if (!user?.active) return null;
    return tx.user.update({ where: { id: user.id }, data: { slackUserId } });
  });
}
