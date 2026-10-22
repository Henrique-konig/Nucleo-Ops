import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai";
import { recordAiUsage } from "@/lib/ai/budget";
import { enqueue, type JobHandler } from "@/lib/jobs/queue";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { getOnCallUserIds } from "@/lib/calendar";
import { PRIORITY_LABELS } from "@/lib/tickets";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";
import { notifyAssigned } from "@/lib/inbox";
import { assertCanRun, loadAgent, recordAgentFailure, recordAgentSuccess } from "./guard";
import type { Priority } from "@/generated/prisma/enums";

// Agente de triagem (RF-02): classifica categoria e prioridade e sugere um
// responsável. Lê só o chamado e as categorias; escreve só esses campos. Não
// exige confirmação, mas a sugestão pode ser desfeita (o log guarda o anterior).

export const triageJob: JobHandler = async (job) => {
  const { ticketId } = z.object({ ticketId: z.string() }).parse(job.payload);
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.triagedAt) return;
  const agent = await loadAgent(ticket.teamId, "TRIAGE");
  if (!agent) return;

  try {
    await assertCanRun(agent);
    const [team, members, onCall] = await Promise.all([
      db.team.findUniqueOrThrow({ where: { id: ticket.teamId }, select: { categories: true } }),
      db.user.findMany({
        where: { teamId: ticket.teamId, active: true, role: { in: ["TECHNICIAN", "COORDINATOR"] } },
        select: { id: true, name: true, _count: { select: { assignedCards: { where: { archivedAt: null, ticket: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } } } } } } },
      }),
      getOnCallUserIds(ticket.teamId),
    ]);

    const { data, usage } = await getAiProvider().triage({
      title: ticket.title,
      description: ticket.description,
      categories: team.categories,
      members: members.map((m) => ({ id: m.id, name: m.name, openCards: m._count.assignedCards, onCall: onCall.includes(m.id) })),
    });
    // O modelo só pode escolher valores válidos.
    const category = team.categories.includes(data.category) ? data.category : null;
    const assignee = members.find((m) => m.id === data.suggestedAssigneeId) ?? null;

    await db.$transaction(async (tx) => {
      await recordAiUsage(tx, { teamId: ticket.teamId, agentId: agent.id, ticketId, purpose: "triage", usage });
      const proposal = { category, priority: data.priority, suggestedAssigneeId: assignee?.id ?? null, reason: data.reason };
      if (agent.dryRun) {
        await recordAction(tx, {
          teamId: ticket.teamId, agentId: agent.id, type: "triage.simulated", targetType: "ticket", targetId: ticketId, payload: proposal,
        });
        return;
      }
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          ...(category && { category }),
          priority: data.priority,
          suggestedAssigneeId: assignee?.id ?? null,
          triagedAt: new Date(),
          triagedByAgent: true,
        },
      });
      await recordAction(tx, {
        teamId: ticket.teamId, agentId: agent.id, type: "triage.apply", targetType: "ticket", targetId: ticketId,
        payload: { from: { category: ticket.category, priority: ticket.priority }, to: proposal },
      });
      await enqueue(tx, {
        teamId: ticket.teamId,
        type: "notify.team",
        payload: {
          ticketId,
          text: `Novo chamado: ${ticket.title} — ${category ?? "sem categoria"}, prioridade ${PRIORITY_LABELS[data.priority].toLowerCase()}${assignee ? `, sugestão: ${assignee.name}` : ""}.`,
        },
      });
      // A pesquisa roda depois da triagem, já com a categoria definida.
      const research = await tx.agent.findUnique({ where: { teamId_type: { teamId: ticket.teamId, type: "RESEARCH" } } });
      if (research?.active && !research.pausedReason && ticket.channel !== "CHAT") {
        await enqueue(tx, { teamId: ticket.teamId, type: "agent.research", payload: { ticketId }, dedupeKey: `agent.research:${ticketId}:auto` });
      }
    });
    await recordAgentSuccess(agent.id);
  } catch (err) {
    await recordAgentFailure(agent.id, err);
    throw err;
  }
};

/** Desfaz a última triagem automática, restaurando categoria e prioridade anteriores. */
export async function undoTriage(actor: Actor, ticketId: string) {
  assertCan(actor.role, "card:edit");
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId } });
    if (!ticket) throw new NotFoundError("Chamado");
    if (!ticket.triagedByAgent) throw new BusinessError("Este chamado não tem triagem automática para desfazer");
    const last = await tx.action.findFirst({ where: { targetId: ticketId, type: "triage.apply" }, orderBy: { createdAt: "desc" } });
    const previous = (last?.payload as { from?: { category: string | null; priority: Priority } } | null)?.from;
    await tx.ticket.update({
      where: { id: ticketId },
      data: { category: previous?.category ?? null, priority: previous?.priority ?? "MEDIUM", suggestedAssigneeId: null, triagedByAgent: false },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "triage.undo", targetType: "ticket", targetId: ticketId,
      payload: { restored: previous ?? null, undoneActionId: last?.id ?? null },
    });
  });
}

/** Coordenador aceita o responsável sugerido: atribui o cartão. */
export async function acceptSuggestedAssignee(actor: Actor, ticketId: string) {
  assertCan(actor.role, "card:assign");
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { id: ticketId, teamId: actor.teamId }, include: { card: true } });
    if (!ticket?.card) throw new NotFoundError("Cartão do chamado");
    if (!ticket.suggestedAssigneeId) throw new BusinessError("Não há responsável sugerido");
    await tx.card.update({ where: { id: ticket.card.id }, data: { assigneeId: ticket.suggestedAssigneeId } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "card.update", targetType: "card", targetId: ticket.card.id,
      payload: { assigneeId: { from: ticket.card.assigneeId, to: ticket.suggestedAssigneeId }, reason: "triage.suggestion" },
    });
    if (ticket.card.assigneeId !== ticket.suggestedAssigneeId) {
      await notifyAssigned(tx, ticket.card, ticket.suggestedAssigneeId, actor.teamId, actor.id);
    }
  });
}
