import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs/queue";
import { assertWithinBudget } from "@/lib/ai/budget";
import type { AgentType } from "@/generated/prisma/enums";

// Controles transversais dos agentes: ativo/parado, limites de execução por
// minuto e por dia, teto de custo e interrupção automática após falhas seguidas.

export const agentPermissionsSchema = z.object({
  allowedActions: z.array(z.string()).default([]),
  perMinute: z.number().int().min(1).max(1000).default(10),
  perDay: z.number().int().min(1).max(100_000).default(500),
});

export const MAX_CONSECUTIVE_FAILURES = 3;

export class AgentUnavailableError extends Error {}

export async function loadAgent(teamId: string, type: AgentType) {
  const agent = await db.agent.findUnique({ where: { teamId_type: { teamId, type } } });
  if (!agent?.active || agent.pausedReason) return null;
  return { ...agent, limits: agentPermissionsSchema.parse(agent.permissions ?? {}) };
}

export type LoadedAgent = NonNullable<Awaited<ReturnType<typeof loadAgent>>>;

/** Lança erro se o agente passou dos limites de execução ou a equipe passou do teto de custo. */
export async function assertCanRun(agent: LoadedAgent) {
  const now = Date.now();
  const [lastMinute, lastDay] = await Promise.all([
    db.action.count({ where: { agentId: agent.id, createdAt: { gte: new Date(now - 60_000) } } }),
    db.action.count({ where: { agentId: agent.id, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ]);
  if (lastMinute >= agent.limits.perMinute) throw new AgentUnavailableError("Limite por minuto atingido");
  if (lastDay >= agent.limits.perDay) throw new AgentUnavailableError("Limite diário atingido");
  await assertWithinBudget(agent.teamId);
}

export async function recordAgentSuccess(agentId: string) {
  await db.agent.update({ where: { id: agentId }, data: { consecutiveFailures: 0 } });
}

/** Conta a falha; na terceira seguida, pausa o agente e avisa a equipe. */
export async function recordAgentFailure(agentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const agent = await db.agent.update({ where: { id: agentId }, data: { consecutiveFailures: { increment: 1 } } });
  if (agent.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !agent.pausedReason) {
    await db.$transaction(async (tx) => {
      await tx.agent.update({ where: { id: agentId }, data: { pausedReason: `Pausado após ${agent.consecutiveFailures} falhas seguidas: ${message}` } });
      await tx.action.create({
        data: { teamId: agent.teamId, agentId, type: "agent.auto_pause", targetType: "agent", targetId: agentId, payload: { error: message } },
      });
      await enqueue(tx, {
        teamId: agent.teamId,
        type: "notify.team",
        payload: { text: `O agente ${agent.type} foi pausado após ${agent.consecutiveFailures} falhas seguidas. Último erro: ${message}` },
      });
    });
  }
}
