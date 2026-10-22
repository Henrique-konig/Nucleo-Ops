import "server-only";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { getSystemUser } from "@/lib/tickets";

// Rotina diária: relatórios, retenção de dados, conversas paradas do chat e
// lembrete de documentos da base perto de vencer.

const DAY = 86_400_000;

/** Apaga chamados encerrados há mais tempo que a retenção da equipe. O log de auditoria fica. */
export async function purgeExpiredTickets(teamId: string, retentionDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY);
  const expired = await db.ticket.findMany({
    where: { teamId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { lt: cutoff } },
    select: { id: true },
    take: 1000,
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((t) => t.id);
  await db.$transaction(async (tx) => {
    // Cartões guardam título e descrição do chamado: saem junto.
    await tx.card.deleteMany({ where: { ticketId: { in: ids } } });
    await tx.ticket.deleteMany({ where: { id: { in: ids } } });
    const system = await getSystemUser(tx, teamId);
    await recordAction(tx, {
      teamId, userId: system.id, type: "retention.purge", targetType: "team", targetId: teamId,
      payload: { tickets: ids.length, retentionDays, cutoff: cutoff.toISOString() },
    });
  });
  return ids.length;
}

/** Conversas do chat sem resposta do solicitante há 24 h são encerradas (não contam como resolvidas). */
export async function closeIdleConversations(teamId: string, now = new Date()) {
  const result = await db.ticket.updateMany({
    where: { teamId, channel: "CHAT", handoffAt: null, status: { in: ["OPEN", "IN_PROGRESS"] }, updatedAt: { lt: new Date(now.getTime() - DAY) } },
    data: { status: "CLOSED", resolvedAt: now },
  });
  return result.count;
}

export async function runDailyMaintenance(now = new Date()) {
  const teams = await db.team.findMany({ select: { id: true, retentionDays: true } });
  const weekday = new Date(now.getTime() - 3 * 3_600_000).getUTCDay();
  const summary: Record<string, unknown>[] = [];

  for (const team of teams) {
    const purged = team.retentionDays ? await purgeExpiredTickets(team.id, team.retentionDays, now) : 0;
    const closed = await closeIdleConversations(team.id, now);

    await db.$transaction(async (tx) => {
      const day = now.toISOString().slice(0, 10);
      await enqueue(tx, { teamId: team.id, type: "agent.summary", payload: { period: "DAILY" }, dedupeKey: `summary:daily:${team.id}:${day}` });
      // Segunda-feira: relatório da semana e revisão da base de conhecimento.
      if (weekday === 1) {
        await enqueue(tx, { teamId: team.id, type: "agent.summary", payload: { period: "WEEKLY" }, dedupeKey: `summary:weekly:${team.id}:${day}` });
        const expiring = await tx.document.findMany({
          where: { teamId: team.id, validUntil: { lt: new Date(now.getTime() + 7 * DAY) } },
          select: { title: true, validUntil: true },
          orderBy: { validUntil: "asc" },
          take: 20,
        });
        if (expiring.length > 0) {
          await enqueue(tx, {
            teamId: team.id,
            type: "notify.team",
            payload: { text: `Base de conhecimento: ${expiring.length} documento(s) vencido(s) ou vencendo esta semana:\n${expiring.map((d) => `• ${d.title}`).join("\n")}` },
            dedupeKey: `kb:expiring:${team.id}:${day}`,
          });
        }
      }
    });
    summary.push({ teamId: team.id, purged, closed });
  }
  return summary;
}
