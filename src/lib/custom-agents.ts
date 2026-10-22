import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai";
import { assertWithinBudget, recordAiUsage } from "@/lib/ai/budget";
import { enqueue, type JobHandler } from "@/lib/jobs/queue";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { searchDocuments } from "@/lib/knowledge";
import { AiRefusalError } from "@/lib/ai/types";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";

// Agentes personalizados: a equipe define nome, função e instruções. Atribuído a um
// cartão (ou chamado sob demanda), o agente lê o cartão, o chamado e, se quiser, a
// base de conhecimento, e escreve uma análise. Ele não altera nada sozinho: o
// resultado fica no cartão para a pessoa decidir o que fazer.

type Tx = Prisma.TransactionClient;

export const AGENT_COLORS = ["violet", "sky", "emerald", "amber", "rose", "slate"] as const;

/** Modelos para começar rápido; a equipe ajusta o texto antes de salvar. */
export const AGENT_TEMPLATES: { name: string; role: string; instructions: string; color: (typeof AGENT_COLORS)[number] }[] = [
  {
    name: "Analista de incidentes",
    role: "Investiga a causa provável e sugere o diagnóstico",
    color: "rose",
    instructions:
      "Leia o cartão e o chamado e liste as causas mais prováveis, da mais para a menos provável. Para cada uma, diga como confirmar " +
      "(comando, log ou tela a verificar). Termine com o próximo passo recomendado e o risco de não agir.",
  },
  {
    name: "Redator de respostas",
    role: "Escreve a resposta ao solicitante em linguagem simples",
    color: "sky",
    instructions:
      "Escreva uma resposta cordial e curta ao solicitante, sem jargão técnico. Use passos numerados quando houver procedimento. " +
      "Se faltar informação, termine com no máximo duas perguntas objetivas.",
  },
  {
    name: "Planejador de tarefas",
    role: "Quebra o trabalho em etapas e estima o esforço",
    color: "emerald",
    instructions:
      "Quebre o cartão em etapas pequenas e verificáveis, em ordem, cada uma com uma estimativa (P, M ou G). Aponte dependências " +
      "e o que precisa de aprovação. Sugira itens de checklist no formato '- [ ] item'.",
  },
  {
    name: "Revisor de segurança",
    role: "Aponta riscos de segurança e conformidade",
    color: "amber",
    instructions:
      "Avalie o pedido do ponto de vista de segurança: acesso mínimo, dados pessoais (LGPD), segredos expostos, impacto em produção. " +
      "Classifique o risco (baixo, médio, alto) e liste as salvaguardas antes de executar.",
  },
];

const agentSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome").max(60),
  role: z.string().trim().min(2, "Informe a função").max(160),
  instructions: z.string().trim().min(10, "Descreva o que o agente deve fazer").max(8000),
  color: z.enum(AGENT_COLORS).default("violet"),
  runOnAssign: z.boolean().default(true),
  useKnowledge: z.boolean().default(true),
  active: z.boolean().default(true),
});

export type CustomAgentInput = z.input<typeof agentSchema>;

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ---------------------------------------------------------------------------
// Cadastro

export async function listCustomAgents(actor: Actor) {
  assertCan(actor.role, "board:view");
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [agents, runs] = await Promise.all([
    db.customAgent.findMany({
      where: { teamId: actor.teamId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { cards: { where: { archivedAt: null } } } } },
    }),
    db.customAgentRun.groupBy({
      by: ["agentId", "status"],
      where: { agent: { teamId: actor.teamId }, createdAt: { gte: since } },
      _count: true,
    }),
  ]);
  return agents.map(({ _count, ...a }) => {
    const mine = runs.filter((r) => r.agentId === a.id);
    return {
      ...a,
      openCards: _count.cards,
      runsLastWeek: mine.reduce((n, r) => n + r._count, 0),
      failuresLastWeek: mine.filter((r) => r.status === "FAILED").reduce((n, r) => n + r._count, 0),
    };
  });
}

/** Opções para os seletores do quadro (só os ativos). */
export async function customAgentOptions(actor: Actor) {
  return db.customAgent.findMany({
    where: { teamId: actor.teamId, active: true },
    select: { id: true, name: true, role: true, color: true },
    orderBy: { name: "asc" },
  });
}

export async function getCustomAgent(actor: Actor, agentId: string) {
  assertCan(actor.role, "board:view");
  const agent = await db.customAgent.findFirst({
    where: { id: agentId, teamId: actor.teamId },
    include: {
      cards: {
        where: { archivedAt: null },
        select: { id: true, title: true, boardId: true, board: { select: { name: true } }, column: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { card: { select: { id: true, title: true, boardId: true } }, requestedBy: { select: { name: true } } },
      },
    },
  });
  if (!agent) throw new NotFoundError("Agente");
  return agent;
}

export async function createCustomAgent(actor: Actor, input: CustomAgentInput) {
  assertCan(actor.role, "agent:create");
  const data = agentSchema.parse(input);
  try {
    return await db.$transaction(async (tx) => {
      const agent = await tx.customAgent.create({ data: { ...data, teamId: actor.teamId, createdById: actor.id } });
      await recordAction(tx, {
        teamId: actor.teamId, userId: actor.id, type: "custom_agent.create", targetType: "custom_agent", targetId: agent.id,
        payload: { name: agent.name, role: agent.role },
      });
      return agent;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new BusinessError("Já existe um agente com esse nome");
    throw err;
  }
}

export async function updateCustomAgent(actor: Actor, agentId: string, input: CustomAgentInput) {
  assertCan(actor.role, "agent:create");
  const data = agentSchema.parse(input);
  try {
    return await db.$transaction(async (tx) => {
      const agent = await tx.customAgent.findFirst({ where: { id: agentId, teamId: actor.teamId } });
      if (!agent) throw new NotFoundError("Agente");
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(data) as (keyof typeof data)[]) {
        if (agent[key] !== data[key]) changes[key] = { from: agent[key], to: data[key] };
      }
      if (Object.keys(changes).length === 0) return agent;
      const updated = await tx.customAgent.update({ where: { id: agent.id }, data });
      await recordAction(tx, {
        teamId: actor.teamId, userId: actor.id, type: "custom_agent.update", targetType: "custom_agent", targetId: agent.id,
        payload: changes as Prisma.InputJsonValue,
      });
      return updated;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new BusinessError("Já existe um agente com esse nome");
    throw err;
  }
}

/** Exclui o agente; os cartões ficam sem agente e o histórico de execuções vai junto. O log de auditoria permanece. */
export async function deleteCustomAgent(actor: Actor, agentId: string) {
  assertCan(actor.role, "agent:create");
  return db.$transaction(async (tx) => {
    const agent = await tx.customAgent.findFirst({ where: { id: agentId, teamId: actor.teamId } });
    if (!agent) throw new NotFoundError("Agente");
    await tx.customAgent.delete({ where: { id: agent.id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "custom_agent.delete", targetType: "custom_agent", targetId: agent.id,
      payload: { name: agent.name },
    });
  });
}

// ---------------------------------------------------------------------------
// Execução

/** Cria a execução e a tarefa na fila, na transação de quem pediu. */
export async function queueAgentRun(
  tx: Tx,
  entry: { teamId: string; agentId: string; cardId: string; requestedById: string; prompt?: string | null },
) {
  const busy = await tx.customAgentRun.findFirst({
    where: { agentId: entry.agentId, cardId: entry.cardId, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (busy) return busy;
  const run = await tx.customAgentRun.create({
    data: { agentId: entry.agentId, cardId: entry.cardId, requestedById: entry.requestedById, prompt: entry.prompt || null },
  });
  await enqueue(tx, { teamId: entry.teamId, type: "agent.custom", payload: { runId: run.id }, maxAttempts: 1 });
  return run;
}

const runSchema = z.object({
  cardId: z.string().min(1).max(64),
  // Sem agentId, usa o agente atribuído ao cartão.
  agentId: z.string().min(1).max(64).optional(),
  prompt: z.string().trim().max(2000).optional(),
});

/** Pedido manual pela tela do cartão: "Pedir ao agente". */
export async function requestAgentRun(actor: Actor, input: z.input<typeof runSchema>) {
  assertCan(actor.role, "ai:use");
  const data = runSchema.parse(input);
  return db.$transaction(async (tx) => {
    const card = await tx.card.findFirst({ where: { id: data.cardId, board: { teamId: actor.teamId }, archivedAt: null } });
    if (!card) throw new NotFoundError("Cartão");
    const agentId = data.agentId ?? card.agentId;
    if (!agentId) throw new BusinessError("Escolha um agente para este cartão");
    const agent = await tx.customAgent.findFirst({ where: { id: agentId, teamId: actor.teamId } });
    if (!agent) throw new NotFoundError("Agente");
    if (!agent.active) throw new BusinessError(`O agente ${agent.name} está desligado`);
    const run = await queueAgentRun(tx, { teamId: actor.teamId, agentId: agent.id, cardId: card.id, requestedById: actor.id, prompt: data.prompt });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "custom_agent.request", targetType: "card", targetId: card.id,
      payload: { agentId: agent.id, runId: run.id },
    });
    return { id: run.id };
  });
}

/** Execuções recentes de um cartão, da mais nova para a mais antiga. */
export async function listCardRuns(actor: Actor, cardId: string) {
  assertCan(actor.role, "board:view");
  return db.customAgentRun.findMany({
    where: { cardId, card: { board: { teamId: actor.teamId } } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, status: true, prompt: true, output: true, error: true, createdAt: true, finishedAt: true,
      agent: { select: { id: true, name: true, color: true } },
      requestedBy: { select: { name: true } },
    },
  });
}

export const customAgentJob: JobHandler = async (job) => {
  const { runId } = z.object({ runId: z.string() }).parse(job.payload);
  const run = await db.customAgentRun.findUnique({
    where: { id: runId },
    include: {
      agent: true,
      card: {
        include: {
          board: { select: { name: true, teamId: true } },
          column: { select: { name: true } },
          assignee: { select: { name: true } },
          labels: { select: { name: true } },
          checklist: { select: { text: true, done: true }, orderBy: { position: "asc" } },
          ticket: { include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } } },
        },
      },
    },
  });
  if (!run || run.status !== "QUEUED") return;
  const { agent, card } = run;
  const teamId = card.board.teamId;

  const finish = (data: { status: "DONE" | "FAILED"; output?: string; error?: string }) =>
    db.$transaction(async (tx) => {
      await tx.customAgentRun.update({ where: { id: run.id }, data: { ...data, finishedAt: new Date() } });
      await recordAction(tx, {
        teamId, userId: run.requestedById, type: data.status === "DONE" ? "custom_agent.run" : "custom_agent.fail",
        targetType: "card", targetId: card.id, payload: { agentId: agent.id, runId: run.id, ...(data.error && { error: data.error }) },
      });
    });

  if (!agent.active) {
    await finish({ status: "FAILED", error: "O agente foi desligado antes de começar" });
    return;
  }
  await db.customAgentRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });

  try {
    await assertWithinBudget(teamId);
    const ticket = card.ticket;
    const query = [card.title, card.description, ticket?.title, ticket?.description, run.prompt].filter(Boolean).join("\n");
    const sources = agent.useKnowledge ? await searchDocuments(teamId, query, 4).catch(() => []) : [];

    const { data, usage } = await getAiProvider().runAgent({
      agent: { name: agent.name, role: agent.role, instructions: agent.instructions },
      request: run.prompt,
      card: {
        title: card.title,
        description: card.description,
        board: card.board.name,
        column: card.column.name,
        dueDate: card.dueDate?.toISOString().slice(0, 10) ?? null,
        assignee: card.assignee?.name ?? null,
        labels: card.labels.map((l) => l.name),
        checklist: card.checklist,
      },
      ticket: ticket && {
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        conversation: ticket.messages.map((m) => ({
          from: m.authorId === ticket.requesterId || m.authorEmail ? ("solicitante" as const) : ("equipe" as const),
          content: m.content,
          internal: m.internal,
        })),
      },
      sources,
    });

    const used = sources.filter((s) => data.usedSourceIds.includes(s.id));
    const output = used.length > 0 ? `${data.output.trim()}\n\nFontes: ${used.map((s) => s.title).join("; ")}` : data.output.trim();
    await db.$transaction(async (tx) => {
      await recordAiUsage(tx, { teamId, ticketId: ticket?.id, purpose: "custom_agent", usage });
    });
    await finish({ status: "DONE", output });
  } catch (err) {
    await finish({ status: "FAILED", error: runFailure(err) });
  }
};

/** Motivo da falha mostrado no cartão: curto e sem detalhes internos do banco. */
function runFailure(err: unknown) {
  if (err instanceof AiRefusalError) return "O modelo recusou o pedido. Reformule as instruções ou o pedido.";
  if (err instanceof Prisma.PrismaClientKnownRequestError) return "Falha ao gravar o resultado. Tente de novo.";
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 300) || "Falha desconhecida";
}
