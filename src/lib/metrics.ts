import "server-only";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { usdToBrl } from "@/lib/ai/pricing";
import type { Actor } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

// Indicadores (RF-10) e métricas de sucesso do planejamento. A linha de base é a
// primeira semana de uso da equipe; as metas de 3 meses vêm do planejamento.

export type Period = { from: Date; to: Date };

const BRT_OFFSET = 3 * 3_600_000;

export type Metrics = {
  tickets: number;
  resolved: number;
  avgFirstResponseMin: number | null;
  avgResolutionMin: number | null;
  resolvedByAgentPct: number | null; // % dos resolvidos sem intervenção humana
  chatbotFirstLevelPct: number | null; // % das conversas do chat resolvidas pelo assistente
  triagedPct: number | null;
  satisfaction: number | null;
  satisfactionCount: number;
  aiCostBrl: number;
  aiCostPerTicketBrl: number | null;
};

export const TARGETS = {
  firstResponseReduction: 0.5,
  resolutionReduction: 0.3,
  chatbotFirstLevelPct: 20,
  triagedPct: 90,
  satisfaction: 4,
  aiCostPerTicketBrl: 0.5,
} as const;

/** Chamados que entraram na fila da equipe (conversas do chat só depois do handoff). */
function queueTickets(teamId: string, period: Period): Prisma.TicketWhereInput {
  return {
    teamId,
    createdAt: { gte: period.from, lt: period.to },
    OR: [{ channel: { not: "CHAT" } }, { handoffAt: { not: null } }],
  };
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export async function computeMetrics(teamId: string, period: Period): Promise<Metrics> {
  const queue = queueTickets(teamId, period);
  const [times, tickets, resolved, resolvedByAgent, triaged, chats, chatsByAgent, satisfaction, cost, allTickets] = await Promise.all([
    db.$queryRaw<{ first: number | null; resolution: number | null }[]>`
      SELECT
        avg(extract(epoch FROM ("firstResponseAt" - "createdAt")) / 60) FILTER (WHERE "firstResponseAt" IS NOT NULL) AS first,
        avg(extract(epoch FROM ("resolvedAt" - "createdAt")) / 60) FILTER (WHERE "resolvedAt" IS NOT NULL AND NOT "resolvedByAgent") AS resolution
      FROM "Ticket"
      WHERE "teamId" = ${teamId} AND "createdAt" >= ${period.from} AND "createdAt" < ${period.to}
        AND (channel <> 'CHAT' OR "handoffAt" IS NOT NULL)`,
    db.ticket.count({ where: queue }),
    db.ticket.count({ where: { teamId, createdAt: { gte: period.from, lt: period.to }, resolvedAt: { not: null } } }),
    db.ticket.count({ where: { teamId, createdAt: { gte: period.from, lt: period.to }, resolvedAt: { not: null }, resolvedByAgent: true } }),
    db.ticket.count({ where: { ...queue, triagedByAgent: true } }),
    db.ticket.count({ where: { teamId, channel: "CHAT", createdAt: { gte: period.from, lt: period.to } } }),
    db.ticket.count({ where: { teamId, channel: "CHAT", createdAt: { gte: period.from, lt: period.to }, resolvedByAgent: true } }),
    db.ticket.aggregate({ where: { teamId, createdAt: { gte: period.from, lt: period.to }, satisfaction: { not: null } }, _avg: { satisfaction: true }, _count: { satisfaction: true } }),
    db.aiUsage.aggregate({ where: { teamId, createdAt: { gte: period.from, lt: period.to } }, _sum: { costMicroUsd: true } }),
    // Custo por chamado considera todos, inclusive conversas resolvidas pelo assistente.
    db.ticket.count({ where: { teamId, createdAt: { gte: period.from, lt: period.to } } }),
  ]);
  const aiCostBrl = usdToBrl(cost._sum.costMicroUsd ?? 0);
  const round = (v: number | null) => (v == null ? null : Math.round(Number(v)));
  return {
    tickets,
    resolved,
    avgFirstResponseMin: round(times[0]?.first ?? null),
    avgResolutionMin: round(times[0]?.resolution ?? null),
    resolvedByAgentPct: pct(resolvedByAgent, resolved),
    chatbotFirstLevelPct: pct(chatsByAgent, chats),
    triagedPct: pct(triaged, tickets),
    satisfaction: satisfaction._avg.satisfaction == null ? null : Math.round(satisfaction._avg.satisfaction * 10) / 10,
    satisfactionCount: satisfaction._count.satisfaction,
    aiCostBrl,
    aiCostPerTicketBrl: allTickets > 0 ? Math.round((aiCostBrl / allTickets) * 100) / 100 : null,
  };
}

/** Linha de base: primeira semana desde o primeiro chamado da equipe. */
export async function baselineMetrics(teamId: string) {
  const first = await db.ticket.findFirst({ where: { teamId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  if (!first) return null;
  const to = new Date(first.createdAt.getTime() + 7 * 86_400_000);
  // Só vale como linha de base depois que a primeira semana terminou.
  if (to > new Date()) return { period: { from: first.createdAt, to }, metrics: null };
  return { period: { from: first.createdAt, to }, metrics: await computeMetrics(teamId, { from: first.createdAt, to }) };
}

export type Breakdown = { label: string; value: number }[];

export async function breakdowns(teamId: string, period: Period) {
  const queue = queueTickets(teamId, period);
  const [byCategory, byChannel, byAssignee, perDay] = await Promise.all([
    db.ticket.groupBy({ by: ["category"], where: queue, _count: true }),
    db.ticket.groupBy({ by: ["channel"], where: queue, _count: true }),
    db.$queryRaw<{ name: string | null; n: bigint }[]>`
      SELECT u.name, count(*) AS n
      FROM "Ticket" t JOIN "Card" c ON c."ticketId" = t.id LEFT JOIN "User" u ON u.id = c."assigneeId"
      WHERE t."teamId" = ${teamId} AND t."createdAt" >= ${period.from} AND t."createdAt" < ${period.to}
      GROUP BY u.name`,
    db.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', t."createdAt" AT TIME ZONE 'America/Sao_Paulo') AS day, count(*) AS n
      FROM "Ticket" t
      WHERE t."teamId" = ${teamId} AND t."createdAt" >= ${period.from} AND t."createdAt" < ${period.to}
        AND (t.channel <> 'CHAT' OR t."handoffAt" IS NOT NULL)
      GROUP BY 1 ORDER BY 1`,
  ]);
  const sort = (rows: Breakdown) => rows.sort((a, b) => b.value - a.value);
  const CHANNELS: Record<string, string> = { FORM: "Formulário", EMAIL: "E-mail", CHAT: "Chat", WEBHOOK: "Webhook", SLACK: "Slack", TEAMS: "Teams" };

  // Série diária completa, com zeros nos dias sem chamados.
  const days: Breakdown = [];
  const counts = new Map(perDay.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.n)]));
  // Dias contados no fuso de Brasília (UTC−3), como no agrupamento do SQL.
  for (let t = period.from.getTime(); t < period.to.getTime(); t += 86_400_000) {
    const key = new Date(t - BRT_OFFSET).toISOString().slice(0, 10);
    days.push({ label: key, value: counts.get(key) ?? 0 });
  }

  return {
    byCategory: sort(byCategory.map((r) => ({ label: r.category ?? "Sem categoria", value: r._count }))),
    byChannel: sort(byChannel.map((r) => ({ label: CHANNELS[r.channel] ?? r.channel, value: r._count }))),
    byAssignee: sort(byAssignee.map((r) => ({ label: r.name ?? "Sem responsável", value: Number(r.n) }))),
    perDay: days,
  };
}

export async function dashboard(actor: Actor, days: number) {
  assertCan(actor.role, "metrics:view");
  // Dias inteiros: de meia-noite (Brasília) de `days − 1` dias atrás até agora.
  const to = new Date();
  const local = new Date(to.getTime() - BRT_OFFSET);
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BRT_OFFSET;
  const period = { from: new Date(todayStart - (days - 1) * 86_400_000), to };
  const [current, baseline, parts] = await Promise.all([computeMetrics(actor.teamId, period), baselineMetrics(actor.teamId), breakdowns(actor.teamId, period)]);
  return { period, current, baseline, ...parts };
}
