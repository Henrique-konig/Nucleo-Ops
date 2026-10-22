import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan, can } from "@/lib/permissions";
import { enqueue, PermanentJobError, type JobHandler } from "@/lib/jobs/queue";
import { getIntegration } from "@/lib/integrations";
import { hmacSha256Hex } from "@/lib/channels/signature";
import { getAiProvider } from "@/lib/ai";
import { recordAiUsage } from "@/lib/ai/budget";
import { agentPermissionsSchema, assertCanRun, loadAgent, recordAgentFailure, recordAgentSuccess } from "@/lib/agents/guard";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";
import { ACTIONS, catalogFor, isActionKey, validateParams } from "./catalog";
import type { Prisma } from "@/generated/prisma/client";

// Agente de execução (RF-06): roda ações pré-aprovadas com confirmação humana
// em toda ação, log de auditoria, modo de simulação, limites e parada imediata.

type Tx = Prisma.TransactionClient;

async function allowedActions(teamId: string) {
  const agent = await db.agent.findUnique({ where: { teamId_type: { teamId, type: "EXECUTION" } } });
  return agent ? agentPermissionsSchema.parse(agent.permissions ?? {}).allowedActions : [];
}

export async function executionCatalog(teamId: string) {
  return catalogFor(await allowedActions(teamId));
}

async function createProposal(
  tx: Tx,
  data: { teamId: string; ticketId: string | null; actionKey: string; params: Record<string, string>; reason: string | null; dryRun: boolean },
  proposer: { userId: string } | { agentId: string },
) {
  const request = await tx.executionRequest.create({
    data: {
      teamId: data.teamId, ticketId: data.ticketId, actionKey: data.actionKey, params: data.params, reason: data.reason, dryRun: data.dryRun,
      ...("userId" in proposer ? { proposedById: proposer.userId } : { proposedByAgentId: proposer.agentId }),
    },
  });
  await recordAction(tx, {
    teamId: data.teamId, ...proposer, type: "execution.propose", targetType: "execution", targetId: request.id,
    payload: { actionKey: data.actionKey, params: data.params, ticketId: data.ticketId, dryRun: data.dryRun },
  });
  await enqueue(tx, {
    teamId: data.teamId,
    type: "notify.team",
    payload: { text: `Ação aguardando confirmação: ${ACTIONS[data.actionKey as keyof typeof ACTIONS].label} (${Object.values(data.params).join(", ")}).`, ticketId: data.ticketId ?? undefined },
  });
  return request;
}

const proposeSchema = z.object({ ticketId: z.string().nullable(), actionKey: z.string(), params: z.record(z.string(), z.string()), reason: z.string().max(500).optional() });

/** Proposta feita por uma pessoa (também passa pela confirmação de outra). */
export async function proposeExecution(actor: Actor, input: z.input<typeof proposeSchema>) {
  assertCan(actor.role, "execution:propose");
  const data = proposeSchema.parse(input);
  if (!isActionKey(data.actionKey) || !(await allowedActions(actor.teamId)).includes(data.actionKey)) {
    throw new BusinessError("Ação fora da lista de ações permitidas");
  }
  const params = validateParams(data.actionKey, data.params);
  const agent = await db.agent.findUnique({ where: { teamId_type: { teamId: actor.teamId, type: "EXECUTION" } } });
  if (data.ticketId && !(await db.ticket.findFirst({ where: { id: data.ticketId, teamId: actor.teamId } }))) throw new NotFoundError("Chamado");
  return db.$transaction((tx) =>
    createProposal(tx, { teamId: actor.teamId, ticketId: data.ticketId, actionKey: data.actionKey, params, reason: data.reason ?? null, dryRun: agent?.dryRun ?? true }, { userId: actor.id }),
  );
}

/** O agente sugere uma ação do catálogo para o chamado. */
export const proposeExecutionJob: JobHandler = async (job) => {
  const { ticketId } = z.object({ ticketId: z.string() }).parse(job.payload);
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const agent = await loadAgent(ticket.teamId, "EXECUTION");
  if (!agent) return;
  const catalog = catalogFor(agent.limits.allowedActions);
  if (catalog.length === 0) return;
  try {
    await assertCanRun(agent);
    const { data, usage } = await getAiProvider().proposeExecution({ ticket: { title: ticket.title, description: ticket.description }, catalog });
    await db.$transaction(async (tx) => {
      await recordAiUsage(tx, { teamId: ticket.teamId, agentId: agent.id, ticketId, purpose: "execution", usage });
      if (!data.actionKey || !isActionKey(data.actionKey) || !agent.limits.allowedActions.includes(data.actionKey)) {
        await recordAction(tx, { teamId: ticket.teamId, agentId: agent.id, type: "execution.no_action", targetType: "ticket", targetId: ticketId, payload: { reason: data.reason } });
        return;
      }
      const parsed = ACTIONS[data.actionKey].params.safeParse(data.params);
      if (!parsed.success) {
        await recordAction(tx, {
          teamId: ticket.teamId, agentId: agent.id, type: "execution.invalid_params", targetType: "ticket", targetId: ticketId,
          payload: { actionKey: data.actionKey, params: data.params },
        });
        return;
      }
      await createProposal(
        tx,
        { teamId: ticket.teamId, ticketId, actionKey: data.actionKey, params: parsed.data as Record<string, string>, reason: data.reason, dryRun: agent.dryRun },
        { agentId: agent.id },
      );
    });
    await recordAgentSuccess(agent.id);
  } catch (err) {
    await recordAgentFailure(agent.id, err);
    throw err;
  }
};

export async function requestExecutionSuggestion(actor: Actor, ticketId: string) {
  assertCan(actor.role, "execution:propose");
  if (!(await db.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId } }))) throw new NotFoundError("Chamado");
  if (!(await loadAgent(actor.teamId, "EXECUTION"))) throw new BusinessError("O agente de execução está desativado");
  await db.$transaction(async (tx) => {
    await enqueue(tx, { teamId: actor.teamId, type: "agent.execution", payload: { ticketId } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "execution.request_suggestion", targetType: "ticket", targetId: ticketId });
  });
}

/** Confirmação humana: aprovar enfileira a execução; rejeitar encerra. */
export async function decideExecution(actor: Actor, requestId: string, approve: boolean) {
  assertCan(actor.role, "execution:approve");
  return db.$transaction(async (tx) => {
    const request = await tx.executionRequest.findFirst({ where: { id: requestId, teamId: actor.teamId } });
    if (!request) throw new NotFoundError("Execução");
    if (request.status !== "PROPOSED") throw new BusinessError("Esta ação já foi decidida");
    if (approve) {
      const action = isActionKey(request.actionKey) ? ACTIONS[request.actionKey] : null;
      if (!action) throw new BusinessError("Ação desconhecida");
      if (action.sensitive && !can(actor.role, "execution:approve_sensitive")) {
        throw new BusinessError("Ação sensível: só coordenador ou administrador pode confirmar");
      }
      if (action.sensitive && request.proposedById === actor.id) {
        throw new BusinessError("Ação sensível precisa ser confirmada por outra pessoa");
      }
      if (!(await allowedActions(actor.teamId)).includes(request.actionKey)) throw new BusinessError("Ação não está mais na lista de permitidas");
    }
    await tx.executionRequest.update({
      where: { id: request.id },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date() },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: approve ? "execution.approve" : "execution.reject", targetType: "execution", targetId: request.id,
      payload: { actionKey: request.actionKey },
    });
    if (approve) await enqueue(tx, { teamId: actor.teamId, type: "execution.run", payload: { requestId: request.id }, maxAttempts: 1 });
  });
}

/** Executa a ação confirmada no executor configurado (ou só simula). */
export const runExecutionJob: JobHandler = async (job) => {
  const { requestId } = z.object({ requestId: z.string() }).parse(job.payload);
  const request = await db.executionRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "APPROVED" || !request.decidedById) return;
  const agent = await loadAgent(request.teamId, "EXECUTION");

  async function finish(status: "EXECUTED" | "SIMULATED" | "FAILED", result: Prisma.InputJsonValue, agentId?: string) {
    await db.$transaction(async (tx) => {
      await tx.executionRequest.update({ where: { id: request!.id }, data: { status, result, executedAt: new Date() } });
      const actor = agentId ? { agentId } : { userId: request!.decidedById! };
      await recordAction(tx, {
        teamId: request!.teamId, ...actor, type: `execution.${status.toLowerCase()}`, targetType: "execution", targetId: request!.id,
        confirmedById: request!.decidedById!, payload: { actionKey: request!.actionKey, params: request!.params as Prisma.InputJsonValue }, result,
      });
      if (request!.ticketId) {
        await tx.message.create({
          data: {
            ticketId: request!.ticketId, internal: true, channel: "FORM", agentId,
            content: `${status === "EXECUTED" ? "Ação executada" : status === "SIMULATED" ? "Simulação (nada foi alterado)" : "Falha na ação"}: ${ACTIONS[request!.actionKey as keyof typeof ACTIONS]?.label ?? request!.actionKey}\n${JSON.stringify(result)}`,
          },
        });
      }
    });
  }

  // Parada imediata: agente desligado ou pausado depois da confirmação não executa.
  if (!agent) return finish("FAILED", { error: "Agente de execução desativado ou pausado" });
  if (!agent.limits.allowedActions.includes(request.actionKey)) return finish("FAILED", { error: "Ação removida da lista de permitidas" }, agent.id);
  try {
    await assertCanRun(agent);
  } catch (err) {
    return finish("FAILED", { error: err instanceof Error ? err.message : String(err) }, agent.id);
  }

  const payload = { requestId: request.id, action: request.actionKey, params: request.params, dryRun: request.dryRun || agent.dryRun };
  if (payload.dryRun) {
    await finish("SIMULATED", { wouldSend: payload }, agent.id);
    return;
  }
  const executor = await getIntegration(request.teamId, "AUTOMATION");
  if (!executor) return finish("FAILED", { error: "Nenhum executor configurado (integração Automação)" }, agent.id);

  try {
    const body = JSON.stringify(payload);
    const res = await fetch(executor.config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Plantao-Signature": `sha256=${hmacSha256Hex(executor.config.secret, body)}` },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Executor respondeu ${res.status}: ${text.slice(0, 500)}`);
    await finish("EXECUTED", { status: res.status, output: text.slice(0, 4000) }, agent.id);
    await recordAgentSuccess(agent.id);
  } catch (err) {
    await finish("FAILED", { error: err instanceof Error ? err.message : String(err) }, agent.id);
    await recordAgentFailure(agent.id, err);
    // Ação não é repetida automaticamente: pode não ser idempotente.
    throw new PermanentJobError(err instanceof Error ? err.message : String(err));
  }
};

export async function listExecutions(actor: Actor, status?: "PROPOSED" | "DONE") {
  assertCan(actor.role, "execution:view");
  return db.executionRequest.findMany({
    where: { teamId: actor.teamId, ...(status === "PROPOSED" ? { status: "PROPOSED" } : status === "DONE" ? { status: { not: "PROPOSED" } } : {}) },
    include: {
      ticket: { select: { id: true, title: true } },
      proposedBy: { select: { id: true, name: true } },
      proposedByAgent: { select: { id: true } },
      decidedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
