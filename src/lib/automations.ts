import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { enqueue, PermanentJobError, type JobHandler } from "@/lib/jobs/queue";
import { NotFoundError, type Actor } from "@/lib/errors";
import { getSystemUser } from "@/lib/tickets";
import { notifyAssigned } from "@/lib/inbox";
import type { Prisma } from "@/generated/prisma/client";

// Automações do quadro (RF-11): "quando o cartão entrar na coluna X, faça Y".
// A regra é enfileirada na mesma transação do movimento e executada em segundo plano.

type Tx = Prisma.TransactionClient;

export const AUTOMATION_LABELS = {
  NOTIFY_CHANNEL: "Avisar o canal da equipe",
  ASSIGN: "Atribuir responsável",
  NOTIFY_REQUESTER: "Enviar mensagem ao solicitante",
} as const;

export async function runColumnAutomations(tx: Tx, event: { cardId: string; columnId: string; teamId: string }) {
  const rules = await tx.automationRule.findMany({ where: { columnId: event.columnId, active: true } });
  for (const rule of rules) {
    await enqueue(tx, { teamId: event.teamId, type: "automation.run", payload: { ruleId: rule.id, cardId: event.cardId } });
  }
}

export const runAutomationJob: JobHandler = async (job) => {
  const { ruleId, cardId } = z.object({ ruleId: z.string(), cardId: z.string() }).parse(job.payload);
  const rule = await db.automationRule.findUnique({ where: { id: ruleId }, include: { column: true } });
  const card = await db.card.findUnique({ where: { id: cardId }, include: { ticket: true } });
  if (!rule?.active || !card) return;
  // O cartão pode ter saído da coluna antes da regra rodar.
  if (card.columnId !== rule.columnId) return;
  const config = rule.config as Record<string, unknown>;

  await db.$transaction(async (tx) => {
    const system = await getSystemUser(tx, rule.teamId);
    switch (rule.action) {
      case "NOTIFY_CHANNEL": {
        const text = String(config.message || `Cartão "${card.title}" entrou em ${rule.column.name}.`);
        await enqueue(tx, { teamId: rule.teamId, type: "notify.team", payload: { text, cardId: card.id } });
        break;
      }
      case "ASSIGN": {
        const userId = String(config.userId ?? "");
        const member = await tx.user.findFirst({ where: { id: userId, teamId: rule.teamId, active: true } });
        if (!member) throw new PermanentJobError("Responsável da automação não existe mais");
        if (card.assigneeId === member.id) return;
        await tx.card.update({ where: { id: card.id }, data: { assigneeId: member.id } });
        await notifyAssigned(tx, card, member.id, rule.teamId, null);
        break;
      }
      case "NOTIFY_REQUESTER": {
        if (!card.ticket) return;
        const message = await tx.message.create({
          data: { ticketId: card.ticket.id, content: String(config.message || "Seu chamado foi atualizado."), channel: card.ticket.channel },
        });
        await enqueue(tx, { teamId: rule.teamId, type: "notify.requester", payload: { messageId: message.id } });
        break;
      }
    }
    await recordAction(tx, {
      teamId: rule.teamId, userId: system.id, type: "automation.run", targetType: "card", targetId: card.id,
      payload: { ruleId: rule.id, action: rule.action },
    });
  });
};

// ---------------------------------------------------------------------------
// Configuração

export const automationSchema = z.object({
  columnId: z.string().min(1),
  action: z.enum(["NOTIFY_CHANNEL", "ASSIGN", "NOTIFY_REQUESTER"]),
  message: z.string().trim().max(500).optional(),
  userId: z.string().optional(),
});

export async function listAutomations(actor: Actor) {
  assertCan(actor.role, "automation:configure");
  return db.automationRule.findMany({
    where: { teamId: actor.teamId },
    include: { column: { select: { name: true, board: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createAutomation(actor: Actor, input: z.input<typeof automationSchema>) {
  assertCan(actor.role, "automation:configure");
  const data = automationSchema.parse(input);
  return db.$transaction(async (tx) => {
    const column = await tx.column.findFirst({ where: { id: data.columnId, board: { teamId: actor.teamId } } });
    if (!column) throw new NotFoundError("Coluna");
    if (data.action === "ASSIGN") {
      const member = await tx.user.findFirst({ where: { id: data.userId ?? "", teamId: actor.teamId, active: true } });
      if (!member) throw new NotFoundError("Responsável");
    }
    const rule = await tx.automationRule.create({
      data: {
        teamId: actor.teamId, columnId: column.id, action: data.action,
        config: data.action === "ASSIGN" ? { userId: data.userId } : { message: data.message ?? "" },
      },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "automation.create", targetType: "automation", targetId: rule.id,
      payload: { columnId: column.id, action: rule.action },
    });
    return rule;
  });
}

export async function setAutomationActive(actor: Actor, ruleId: string, active: boolean) {
  assertCan(actor.role, "automation:configure");
  return db.$transaction(async (tx) => {
    const rule = await tx.automationRule.findFirst({ where: { id: ruleId, teamId: actor.teamId } });
    if (!rule) throw new NotFoundError("Automação");
    await tx.automationRule.update({ where: { id: rule.id }, data: { active } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: active ? "automation.enable" : "automation.disable",
      targetType: "automation", targetId: rule.id,
    });
  });
}
