import "server-only";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/queue";
import { usdToBrl } from "./pricing";
import type { AiCall } from "./types";
import type { Prisma } from "@/generated/prisma/client";

// Controle de custo de IA: registro por chamada ao modelo, teto mensal por
// equipe e alerta ao atingir 80% (requisito "Custo de IA").

export class BudgetExceededError extends Error {
  constructor() {
    super("Teto mensal de custo de IA atingido");
    this.name = "BudgetExceededError";
  }
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthSpendMicroUsd(teamId: string, now = new Date()) {
  const agg = await db.aiUsage.aggregate({ where: { teamId, createdAt: { gte: monthStart(now) } }, _sum: { costMicroUsd: true } });
  return agg._sum.costMicroUsd ?? 0;
}

/** Gasto do mês em centavos de real. */
export async function monthSpendBrlCents(teamId: string, now = new Date()) {
  return Math.round(usdToBrl(await monthSpendMicroUsd(teamId, now)) * 100);
}

/** Impede novas chamadas ao modelo quando o teto do mês foi atingido. */
export async function assertWithinBudget(teamId: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { aiMonthlyBudgetCents: true } });
  if (team.aiMonthlyBudgetCents == null) return;
  if ((await monthSpendBrlCents(teamId)) >= team.aiMonthlyBudgetCents) throw new BudgetExceededError();
}

/** Registra o consumo e, ao passar de 80% do teto, avisa a equipe uma vez por mês. */
export async function recordAiUsage(
  tx: Prisma.TransactionClient,
  entry: { teamId: string; agentId?: string; ticketId?: string; purpose: string; usage: AiCall | null },
) {
  if (!entry.usage) return;
  await tx.aiUsage.create({
    data: {
      teamId: entry.teamId, agentId: entry.agentId, ticketId: entry.ticketId, purpose: entry.purpose,
      model: entry.usage.model, inputTokens: entry.usage.inputTokens, outputTokens: entry.usage.outputTokens,
      costMicroUsd: entry.usage.costMicroUsd,
    },
  });

  const team = await tx.team.findUniqueOrThrow({ where: { id: entry.teamId }, select: { aiMonthlyBudgetCents: true, aiBudgetAlertMonth: true } });
  if (team.aiMonthlyBudgetCents == null) return;
  const month = new Date().toISOString().slice(0, 7);
  if (team.aiBudgetAlertMonth === month) return;
  const agg = await tx.aiUsage.aggregate({ where: { teamId: entry.teamId, createdAt: { gte: monthStart() } }, _sum: { costMicroUsd: true } });
  const spentCents = Math.round(usdToBrl(agg._sum.costMicroUsd ?? 0) * 100);
  if (spentCents >= team.aiMonthlyBudgetCents * 0.8) {
    await tx.team.update({ where: { id: entry.teamId }, data: { aiBudgetAlertMonth: month } });
    const pct = Math.round((spentCents / team.aiMonthlyBudgetCents) * 100);
    await enqueue(tx, {
      teamId: entry.teamId,
      type: "notify.team",
      payload: { text: `Atenção: o custo de IA do mês chegou a ${pct}% do teto (R$ ${(spentCents / 100).toFixed(2)} de R$ ${(team.aiMonthlyBudgetCents / 100).toFixed(2)}).` },
    });
  }
}
