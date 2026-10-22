import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { agentPermissionsSchema } from "@/lib/agents/guard";
import { integrationSchemas, openIntegrationConfig, sealIntegrationConfig, appUrl } from "@/lib/integrations";
import { isActionKey } from "@/lib/execution/catalog";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";
import type { AgentType, IntegrationType } from "@/generated/prisma/enums";

// Administração: usuários e papéis, agentes (limites, ações permitidas, simulação,
// parada imediata), integrações (configuração cifrada) e dados da equipe.

const roleSchema = z.enum(["REQUESTER", "TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"]);

// ---------------------------------------------------------------------------
// Usuários

export async function listUsers(actor: Actor) {
  assertCan(actor.role, "user:manage");
  return db.user.findMany({
    // O usuário de sistema (automações) não é gerenciável.
    where: { teamId: actor.teamId, NOT: { email: { startsWith: "sistema+" } } },
    select: { id: true, name: true, email: true, role: true, active: true, slackUserId: true, passwordHash: true, createdAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

function temporaryPassword() {
  return randomBytes(9).toString("base64url");
}

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
  role: roleSchema,
});

/** Cria o usuário com senha temporária, devolvida uma única vez. */
export async function createUser(actor: Actor, input: z.input<typeof createUserSchema>) {
  assertCan(actor.role, "user:manage");
  const data = createUserSchema.parse(input);
  const password = temporaryPassword();
  const user = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ...data, teamId: actor.teamId, passwordHash: await bcrypt.hash(password, 12) } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "user.create", targetType: "user", targetId: user.id, payload: { email: user.email, role: user.role } });
    return user;
  });
  return { id: user.id, password };
}

const updateUserSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  slackUserId: z.string().trim().max(40).nullable().optional(),
});

export async function updateUser(actor: Actor, userId: string, input: z.input<typeof updateUserSchema>) {
  assertCan(actor.role, "user:manage");
  const data = updateUserSchema.parse(input);
  if (userId === actor.id && (data.active === false || (data.role && data.role !== "ADMIN"))) {
    throw new BusinessError("Você não pode remover o próprio acesso de administrador");
  }
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, teamId: actor.teamId } });
    if (!user) throw new NotFoundError("Usuário");
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      const to = key === "slackUserId" ? data[key] || null : data[key];
      if (to !== undefined && to !== user[key]) changes[key] = { from: user[key], to };
    }
    if (Object.keys(changes).length === 0) return;
    await tx.user.update({ where: { id: userId }, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])) });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "user.update", targetType: "user", targetId: userId, payload: changes as never });
  });
}

export async function resetUserPassword(actor: Actor, userId: string) {
  assertCan(actor.role, "user:manage");
  const password = temporaryPassword();
  await db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, teamId: actor.teamId } });
    if (!user) throw new NotFoundError("Usuário");
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "user.reset_password", targetType: "user", targetId: userId });
  });
  return { password };
}

const changePasswordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(12, "A nova senha precisa ter pelo menos 12 caracteres").max(200),
});

/** Troca da própria senha. */
export async function changeOwnPassword(actor: Actor, input: z.input<typeof changePasswordSchema>) {
  const data = changePasswordSchema.parse(input);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.passwordHash || !(await bcrypt.compare(data.current, user.passwordHash))) throw new BusinessError("Senha atual incorreta");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(data.next, 12) } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "user.change_password", targetType: "user", targetId: actor.id });
  });
}

// ---------------------------------------------------------------------------
// Agentes

export const AGENT_LABELS: Record<AgentType, string> = {
  TRIAGE: "Triagem",
  RESEARCH: "Pesquisa",
  EXECUTION: "Execução",
  SUMMARY: "Resumo",
  CHATBOT: "Chatbot",
};

const AGENT_TYPES: AgentType[] = ["TRIAGE", "RESEARCH", "CHATBOT", "EXECUTION", "SUMMARY"];

export async function listAgents(actor: Actor) {
  assertCan(actor.role, "agent:manage");
  // Garante um registro por tipo, para todos aparecerem na tela.
  for (const type of AGENT_TYPES) {
    await db.agent.upsert({ where: { teamId_type: { teamId: actor.teamId, type } }, update: {}, create: { teamId: actor.teamId, type } });
  }
  const agents = await db.agent.findMany({ where: { teamId: actor.teamId } });
  const since = new Date(Date.now() - 86_400_000);
  const counts = await db.action.groupBy({ by: ["agentId"], where: { teamId: actor.teamId, agentId: { not: null }, createdAt: { gte: since } }, _count: true });
  return AGENT_TYPES.map((type) => {
    const agent = agents.find((a) => a.type === type)!;
    return { ...agent, limits: agentPermissionsSchema.parse(agent.permissions ?? {}), actionsLastDay: counts.find((c) => c.agentId === agent.id)?._count ?? 0 };
  });
}

const agentSettingsSchema = z.object({
  active: z.boolean(),
  dryRun: z.boolean(),
  perMinute: z.coerce.number().int().min(1).max(1000),
  perDay: z.coerce.number().int().min(1).max(100_000),
  allowedActions: z.array(z.string()).default([]),
});

export async function updateAgent(actor: Actor, agentId: string, input: z.input<typeof agentSettingsSchema>) {
  assertCan(actor.role, "agent:manage");
  const data = agentSettingsSchema.parse(input);
  const allowedActions = data.allowedActions.filter(isActionKey);
  return db.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({ where: { id: agentId, teamId: actor.teamId } });
    if (!agent) throw new NotFoundError("Agente");
    const permissions = { allowedActions: agent.type === "EXECUTION" ? allowedActions : [], perMinute: data.perMinute, perDay: data.perDay };
    await tx.agent.update({
      where: { id: agentId },
      // Reativar limpa a pausa automática e o contador de falhas.
      data: { active: data.active, dryRun: data.dryRun, permissions, ...(data.active && { pausedReason: null, consecutiveFailures: 0 }) },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "agent.update", targetType: "agent", targetId: agentId,
      payload: { before: { active: agent.active, dryRun: agent.dryRun, permissions: agent.permissions }, after: { active: data.active, dryRun: data.dryRun, permissions } },
    });
  });
}

/** Botão de parada imediata: desliga o agente e cancela execuções ainda não iniciadas. */
export async function stopAgent(actor: Actor, agentId: string) {
  assertCan(actor.role, "agent:manage");
  return db.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({ where: { id: agentId, teamId: actor.teamId } });
    if (!agent) throw new NotFoundError("Agente");
    await tx.agent.update({ where: { id: agentId }, data: { active: false, pausedReason: "Parado pelo administrador" } });
    let cancelled = 0;
    if (agent.type === "EXECUTION") {
      const result = await tx.executionRequest.updateMany({
        where: { teamId: actor.teamId, status: { in: ["PROPOSED", "APPROVED"] } },
        data: { status: "REJECTED", result: { error: "Cancelada pela parada imediata do agente" }, decidedById: actor.id, decidedAt: new Date() },
      });
      cancelled = result.count;
    }
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "agent.stop", targetType: "agent", targetId: agentId, payload: { cancelledExecutions: cancelled } });
  });
}

// ---------------------------------------------------------------------------
// Integrações

export const INTEGRATION_LABELS: Record<IntegrationType, string> = {
  EMAIL: "E-mail",
  SLACK: "Slack",
  TEAMS: "Microsoft Teams",
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  GOOGLE_CALENDAR: "Agenda de plantão (iCal)",
  WEBHOOK: "Webhook genérico",
  AUTOMATION: "Executor de ações",
};

/** Campos de configuração de cada tipo, para montar o formulário. Segredos são gerados quando vazios. */
export const INTEGRATION_FIELDS: Record<IntegrationType, { name: string; label: string; secret?: boolean; generate?: boolean; optional?: boolean; options?: string[] }[]> = {
  EMAIL: [
    { name: "provider", label: "Provedor de envio", options: ["log", "resend"] },
    { name: "apiKey", label: "Chave da API (Resend)", secret: true, optional: true },
    { name: "from", label: "Remetente" },
    { name: "inboundToken", label: "Token de entrada", secret: true, generate: true },
  ],
  SLACK: [
    { name: "botToken", label: "Bot token (xoxb-…)", secret: true },
    { name: "signingSecret", label: "Signing secret", secret: true },
    { name: "channelId", label: "Canal da equipe (id)" },
  ],
  TEAMS: [
    { name: "webhookUrl", label: "URL do webhook de entrada", secret: true },
    { name: "outgoingSecret", label: "Segredo do webhook de saída (base64)", secret: true, optional: true },
  ],
  GITHUB: [{ name: "webhookSecret", label: "Segredo do webhook", secret: true, generate: true }],
  GITLAB: [{ name: "webhookToken", label: "Token secreto do webhook", secret: true, generate: true }],
  GOOGLE_CALENDAR: [{ name: "icsUrl", label: "Endereço secreto iCal", secret: true }],
  WEBHOOK: [
    { name: "secret", label: "Segredo de assinatura", secret: true, generate: true },
    { name: "callbackUrl", label: "URL de retorno (opcional)", optional: true },
  ],
  AUTOMATION: [
    { name: "url", label: "URL do executor" },
    { name: "secret", label: "Segredo de assinatura", secret: true, generate: true },
  ],
};

/** URL que o serviço externo deve chamar, quando a integração recebe eventos. */
export function inboundUrl(type: IntegrationType, id: string): string | null {
  const paths: Partial<Record<IntegrationType, string>> = {
    EMAIL: `/api/inbound/email/${id}`,
    WEBHOOK: `/api/inbound/webhook/${id}`,
    SLACK: `/api/integrations/slack/${id}`,
    TEAMS: `/api/integrations/teams/${id}`,
    GITHUB: `/api/integrations/github/${id}`,
    GITLAB: `/api/integrations/gitlab/${id}`,
  };
  return paths[type] ? appUrl(paths[type]) : null;
}

export async function listIntegrations(actor: Actor) {
  assertCan(actor.role, "integration:manage");
  const rows = await db.integration.findMany({ where: { teamId: actor.teamId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => {
    let summary: Record<string, string> = {};
    try {
      const config = openIntegrationConfig(r.type, r.configEncrypted) as Record<string, string | undefined>;
      // Só os campos não secretos aparecem na listagem.
      summary = Object.fromEntries(
        INTEGRATION_FIELDS[r.type].filter((f) => !f.secret && config[f.name]).map((f) => [f.label, String(config[f.name])]),
      );
    } catch {
      summary = { Erro: "configuração ilegível (chave de cifragem mudou?)" };
    }
    return { id: r.id, type: r.type, name: r.name, active: r.active, createdAt: r.createdAt, summary, inboundUrl: inboundUrl(r.type, r.id) };
  });
}

/** Cria a integração e devolve os segredos gerados (mostrados uma única vez). */
export async function createIntegration(actor: Actor, type: IntegrationType, name: string, fields: Record<string, string>) {
  assertCan(actor.role, "integration:manage");
  if (!Object.hasOwn(integrationSchemas, type)) throw new BusinessError("Tipo de integração inválido");
  const generated: Record<string, string> = {};
  const config: Record<string, string> = {};
  for (const field of INTEGRATION_FIELDS[type]) {
    let value = (fields[field.name] ?? "").trim();
    if (!value && field.generate) {
      value = randomBytes(24).toString(type === "TEAMS" ? "base64" : "hex");
      generated[field.label] = value;
    }
    if (value) config[field.name] = value;
  }
  const sealed = sealIntegrationConfig(type, config);
  const integration = await db.$transaction(async (tx) => {
    const integration = await tx.integration.create({ data: { teamId: actor.teamId, type, name: name.trim().slice(0, 80) || INTEGRATION_LABELS[type], configEncrypted: sealed } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "integration.create", targetType: "integration", targetId: integration.id, payload: { type, name: integration.name } });
    return integration;
  });
  return { id: integration.id, generated, inboundUrl: inboundUrl(type, integration.id) };
}

export async function setIntegrationActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor.role, "integration:manage");
  return db.$transaction(async (tx) => {
    const integration = await tx.integration.findFirst({ where: { id, teamId: actor.teamId } });
    if (!integration) throw new NotFoundError("Integração");
    await tx.integration.update({ where: { id }, data: { active } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: active ? "integration.enable" : "integration.disable", targetType: "integration", targetId: id });
  });
}

// ---------------------------------------------------------------------------
// Equipe

const teamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(3).max(60),
  categories: z.array(z.string().trim().min(1).max(60)).min(1, "Informe ao menos uma categoria").max(40),
  aiMonthlyBudgetCents: z.number().int().min(0).nullable(),
  retentionDays: z.number().int().min(30, "Retenção mínima de 30 dias").max(3650).nullable(),
});

export async function updateTeam(actor: Actor, input: z.input<typeof teamSchema>) {
  assertCan(actor.role, "team:manage");
  const data = teamSchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = await tx.team.findUniqueOrThrow({ where: { id: actor.teamId } });
    await tx.team.update({ where: { id: actor.teamId }, data: { ...data, categories: [...new Set(data.categories)] } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "team.update", targetType: "team", targetId: actor.teamId,
      payload: {
        before: { name: before.name, timezone: before.timezone, categories: before.categories, aiMonthlyBudgetCents: before.aiMonthlyBudgetCents, retentionDays: before.retentionDays },
        after: data,
      },
    });
  });
}
