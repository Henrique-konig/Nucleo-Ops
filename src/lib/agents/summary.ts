import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai";
import { recordAiUsage } from "@/lib/ai/budget";
import { enqueue, type JobHandler } from "@/lib/jobs/queue";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { computeMetrics } from "@/lib/metrics";
import { STATUS_LABELS } from "@/lib/tickets";
import { BusinessError, type Actor } from "@/lib/errors";
import { assertCanRun, loadAgent, recordAgentFailure, recordAgentSuccess } from "./guard";
import type { ReportPeriod } from "@/generated/prisma/enums";

// Agente de resumo (RF-09): relatório diário e semanal do que foi feito.
// Lê ações e chamados do período; escreve só o relatório.

/** Período fechado anterior a `now`, em dias do fuso de Brasília (UTC−3). */
export function reportPeriod(period: ReportPeriod, now = new Date()) {
  const offset = 3 * 3_600_000;
  const local = new Date(now.getTime() - offset);
  const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset;
  if (period === "DAILY") return { from: new Date(todayStart - 86_400_000), to: new Date(todayStart) };
  // Semana anterior, de segunda a segunda.
  const weekday = (local.getUTCDay() + 6) % 7;
  const weekStart = todayStart - weekday * 86_400_000;
  return { from: new Date(weekStart - 7 * 86_400_000), to: new Date(weekStart) };
}

export const summaryJob: JobHandler = async (job) => {
  const { period } = z.object({ period: z.enum(["DAILY", "WEEKLY"]) }).parse(job.payload);
  const agent = await loadAgent(job.teamId, "SUMMARY");
  if (!agent) return;
  const range = reportPeriod(period);
  if (await db.report.findUnique({ where: { teamId_period_periodStart: { teamId: job.teamId, period, periodStart: range.from } } })) return;

  try {
    await assertCanRun(agent);
    const [metrics, tickets, actions] = await Promise.all([
      computeMetrics(job.teamId, range),
      db.ticket.findMany({
        where: { teamId: job.teamId, OR: [{ createdAt: { gte: range.from, lt: range.to } }, { resolvedAt: { gte: range.from, lt: range.to } }] },
        select: { title: true, status: true, category: true, resolvedByAgent: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      db.action.groupBy({ by: ["type"], where: { teamId: job.teamId, createdAt: { gte: range.from, lt: range.to }, type: { in: ["execution.executed", "draft.send", "triage.apply", "chat.resolved"] } }, _count: true }),
    ]);
    const count = (type: string) => actions.find((a) => a.type === type)?._count ?? 0;
    const label = period === "DAILY"
      ? `Resumo do dia ${range.from.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
      : `Resumo da semana de ${range.from.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} a ${new Date(range.to.getTime() - 1).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    const stats = {
      "Chamados abertos": metrics.tickets,
      "Chamados resolvidos": metrics.resolved,
      "Tempo médio de primeira resposta (min)": metrics.avgFirstResponseMin ?? "—",
      "Tempo médio de resolução (min)": metrics.avgResolutionMin ?? "—",
      "Triados automaticamente (%)": metrics.triagedPct ?? "—",
      "Conversas resolvidas pelo chatbot (%)": metrics.chatbotFirstLevelPct ?? "—",
      "Respostas enviadas a partir de rascunhos": count("draft.send"),
      "Ações executadas": count("execution.executed"),
      "Satisfação média": metrics.satisfaction ?? "—",
      "Custo de IA (R$)": metrics.aiCostBrl.toFixed(2),
    };
    const { data, usage } = await getAiProvider().summarize({
      periodLabel: label,
      stats,
      highlights: tickets.map((t) => ({ title: t.title, status: STATUS_LABELS[t.status], category: t.category, resolvedByAgent: t.resolvedByAgent })),
    });

    await db.$transaction(async (tx) => {
      await recordAiUsage(tx, { teamId: job.teamId, agentId: agent.id, purpose: "summary", usage });
      if (agent.dryRun) {
        await recordAction(tx, { teamId: job.teamId, agentId: agent.id, type: "report.simulated", targetType: "team", targetId: job.teamId, payload: { period, from: range.from } });
        return;
      }
      const report = await tx.report.create({
        data: { teamId: job.teamId, period, periodStart: range.from, periodEnd: range.to, content: data.summary, stats },
      });
      await recordAction(tx, { teamId: job.teamId, agentId: agent.id, type: "report.create", targetType: "report", targetId: report.id, payload: { period } });
      await enqueue(tx, { teamId: job.teamId, type: "notify.team", payload: { text: `${label}\n\n${data.summary.slice(0, 2500)}` } });
    });
    await recordAgentSuccess(agent.id);
  } catch (err) {
    await recordAgentFailure(agent.id, err);
    throw err;
  }
};

export async function listReports(actor: Actor) {
  assertCan(actor.role, "metrics:view");
  return db.report.findMany({ where: { teamId: actor.teamId }, orderBy: { periodStart: "desc" }, take: 60 });
}

export async function requestReport(actor: Actor, period: ReportPeriod) {
  assertCan(actor.role, "metrics:view");
  if (!(await loadAgent(actor.teamId, "SUMMARY"))) throw new BusinessError("O agente de resumo está desativado");
  await db.$transaction(async (tx) => {
    await enqueue(tx, { teamId: actor.teamId, type: "agent.summary", payload: { period } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "report.request", targetType: "team", targetId: actor.teamId, payload: { period } });
  });
}
