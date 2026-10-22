import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, jobsOf, testDb as db } from "./fixtures";
import * as tickets from "@/lib/tickets";
import { setAiProvider } from "@/lib/ai";
import { LocalProvider } from "@/lib/ai/local";
import { triageJob, undoTriage, acceptSuggestedAssignee } from "@/lib/agents/triage";
import { researchJob, sendDraft } from "@/lib/agents/research";
import { MAX_CONSECUTIVE_FAILURES } from "@/lib/agents/guard";
import { BudgetExceededError, monthSpendBrlCents, recordAiUsage } from "@/lib/ai/budget";
import { searchDocuments } from "@/lib/knowledge";
import type { AgentType } from "@/generated/prisma/enums";
import type { TriageInput } from "@/lib/ai/types";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;

async function agent(type: AgentType, data: { active?: boolean; dryRun?: boolean } = {}) {
  return db.agent.upsert({
    where: { teamId_type: { teamId: fx.team.id, type } },
    update: { active: true, dryRun: false, pausedReason: null, consecutiveFailures: 0, ...data },
    create: { teamId: fx.team.id, type, active: true, dryRun: false, ...data },
  });
}

async function newTicket(title: string, description: string) {
  const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title, description, requester: { userId: fx.actors.REQUESTER.id } });
  return ticket;
}

const job = (payload: object) => ({ id: "j", teamId: fx.team.id, payload: payload as never, attempts: 1 });

describe.skipIf(!hasDb)("agentes (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("ag");
    await db.document.createMany({
      data: [
        { teamId: fx.team.id, title: "VPN não conecta", content: "Remova o perfil da VPN e importe novamente pelo portal. Erro 809 indica bloqueio da rede local." },
        { teamId: fx.team.id, title: "Impressora travada", content: "Cancele a fila de impressão e reinicie o spooler." },
        { teamId: fx.team.id, title: "Procedimento antigo de VPN", content: "Use o cliente antigo da VPN.", validUntil: new Date("2020-01-01") },
      ],
    });
  });
  afterEach(() => setAiProvider(null));
  afterAll(() => db.$disconnect());

  it("busca na base ignora documentos vencidos", async () => {
    const results = await searchDocuments(fx.team.id, "a VPN não conecta, erro 809");
    expect(results[0].title).toBe("VPN não conecta");
    expect(results.some((r) => r.title.includes("antigo"))).toBe(false);
  });

  it("triagem aplica categoria, prioridade e sugestão; pode ser desfeita", async () => {
    await agent("TRIAGE");
    await agent("RESEARCH", { active: false });
    const ticket = await newTicket("VPN caiu", "Não consigo trabalhar, a VPN não conecta");
    await triageJob(job({ ticketId: ticket.id }));
    const triaged = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(triaged).toMatchObject({ category: "Rede", priority: "HIGH", triagedByAgent: true });
    expect(triaged.suggestedAssigneeId).not.toBeNull();
    const log = await db.action.findFirstOrThrow({ where: { targetId: ticket.id, type: "triage.apply" } });
    expect(log.agentId).not.toBeNull();
    expect(log.userId).toBeNull();

    await acceptSuggestedAssignee(fx.actors.COORDINATOR, ticket.id);
    expect((await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } })).assigneeId).toBe(triaged.suggestedAssigneeId);

    await undoTriage(fx.actors.TECHNICIAN, ticket.id);
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ category: null, priority: "MEDIUM", triagedByAgent: false });
  });

  it("modo de simulação só registra o que faria", async () => {
    await agent("TRIAGE", { dryRun: true });
    const ticket = await newTicket("Impressora", "Fila travada");
    await triageJob(job({ ticketId: ticket.id }));
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).triagedByAgent).toBe(false);
    expect(await db.action.count({ where: { targetId: ticket.id, type: "triage.simulated" } })).toBe(1);
  });

  it("pesquisa propõe rascunho com fonte; técnico envia e o solicitante é avisado", async () => {
    await agent("RESEARCH");
    const ticket = await newTicket("VPN com erro 809", "A VPN não conecta e mostra erro 809");
    await researchJob(job({ ticketId: ticket.id }));
    const draft = await db.replyDraft.findFirstOrThrow({ where: { ticketId: ticket.id, status: "PENDING" } });
    expect(draft.sources).toEqual([expect.objectContaining({ type: "document", title: "VPN não conecta" })]);
    // Nada chega ao solicitante antes da revisão.
    expect(await db.message.count({ where: { ticketId: ticket.id } })).toBe(1);

    await sendDraft(fx.actors.TECHNICIAN, { draftId: draft.id, content: `${draft.content}\n\nAbraço, Tânia` });
    const sent = await db.message.findFirstOrThrow({ where: { ticketId: ticket.id, authorId: fx.actors.TECHNICIAN.id } });
    expect(sent.content).toContain("Abraço, Tânia");
    expect((await db.replyDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("SENT");
    expect((await jobsOf(fx.team.id, "notify.requester")).some((j) => (j.payload as { messageId: string }).messageId === sent.id)).toBe(true);
    await expect(sendDraft(fx.actors.TECHNICIAN, { draftId: draft.id, content: "de novo" })).rejects.toThrow(/já foi usado/);
  });

  it("registra custo e respeita o teto mensal", async () => {
    const triage = await agent("TRIAGE");
    const local = new LocalProvider();
    setAiProvider({
      ...local,
      name: "fake",
      triage: async (input: TriageInput) => ({ ...(await local.triage(input)), usage: { model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 500, costMicroUsd: 14_000 } }),
    } as never);
    const ticket = await newTicket("Mouse", "Mouse falhando");
    await triageJob(job({ ticketId: ticket.id }));
    const usage = await db.aiUsage.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(usage).toMatchObject({ purpose: "triage", costMicroUsd: 14_000, agentId: triage.id });

    // Teto de R$ 0,05: o gasto (~R$ 0,076) já passou, a próxima triagem é barrada.
    await db.team.update({ where: { id: fx.team.id }, data: { aiMonthlyBudgetCents: 5 } });
    const other = await newTicket("Teclado", "Teclado falhando");
    await expect(triageJob(job({ ticketId: other.id }))).rejects.toThrow(BudgetExceededError);
    await db.team.update({ where: { id: fx.team.id }, data: { aiMonthlyBudgetCents: null } });
  });

  it("alerta de 80% do teto é enviado uma vez por mês", async () => {
    await agent("TRIAGE");
    const local = new LocalProvider();
    setAiProvider({ ...local, triage: async (i: TriageInput) => ({ ...(await local.triage(i)), usage: { model: "x", inputTokens: 1, outputTokens: 1, costMicroUsd: 10_000 } }) } as never);
    // Teto logo acima do gasto atual: a próxima chamada passa de 80%.
    const spent = await monthSpendBrlCents(fx.team.id);
    await db.team.update({ where: { id: fx.team.id }, data: { aiMonthlyBudgetCents: spent + 1, aiBudgetAlertMonth: null } });
    const isAlert = (j: { payload: unknown }) => String((j.payload as { text?: string }).text).includes("custo de IA");
    const before = (await jobsOf(fx.team.id, "notify.team")).filter(isAlert).length;

    await triageJob(job({ ticketId: (await newTicket("Alerta", "Teste de alerta de custo")).id }));
    expect((await jobsOf(fx.team.id, "notify.team")).filter(isAlert).length).toBe(before + 1);
    expect((await db.team.findUniqueOrThrow({ where: { id: fx.team.id } })).aiBudgetAlertMonth).toBe(new Date().toISOString().slice(0, 7));

    // Mesmo mês: sem novo alerta.
    await db.$transaction((tx) => recordAiUsage(tx, { teamId: fx.team.id, purpose: "teste", usage: { model: "x", inputTokens: 1, outputTokens: 1, costMicroUsd: 1 } }));
    expect((await jobsOf(fx.team.id, "notify.team")).filter(isAlert).length).toBe(before + 1);
    await db.team.update({ where: { id: fx.team.id }, data: { aiMonthlyBudgetCents: null } });
  });

  it("pausa o agente após falhas seguidas", async () => {
    const triage = await agent("TRIAGE");
    setAiProvider({ ...new LocalProvider(), triage: async () => { throw new Error("API fora do ar"); } } as never);
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      const ticket = await newTicket(`Falha ${i}`, "Teste de falha");
      await expect(triageJob(job({ ticketId: ticket.id }))).rejects.toThrow("API fora do ar");
    }
    const paused = await db.agent.findUniqueOrThrow({ where: { id: triage.id } });
    expect(paused.pausedReason).toContain("API fora do ar");
    expect(await db.action.count({ where: { agentId: triage.id, type: "agent.auto_pause" } })).toBe(1);
    // Pausado, não roda mais.
    const ticket = await newTicket("Depois da pausa", "Não deve ser triado");
    await triageJob(job({ ticketId: ticket.id }));
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).triagedAt).toBeNull();
  });
});
