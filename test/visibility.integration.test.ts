import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, jobsOf, testDb as db } from "./fixtures";
import * as tickets from "@/lib/tickets";
import { computeMetrics, dashboard } from "@/lib/metrics";
import { reportPeriod, summaryJob } from "@/lib/agents/summary";
import { closeIdleConversations, purgeExpiredTickets, runDailyMaintenance } from "@/lib/maintenance";
import { syncPullRequest, linkCard } from "@/lib/code-links";
import { ForbiddenError } from "@/lib/permissions";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;
const hours = (h: number) => h * 3_600_000;

async function ticketAt(createdAt: Date, data: Partial<{ firstResponseAt: Date; resolvedAt: Date; status: "RESOLVED" | "OPEN" | "CLOSED"; category: string; triagedByAgent: boolean; satisfaction: number; resolvedByAgent: boolean; channel: "FORM" | "CHAT"; handoffAt: Date }>) {
  return db.ticket.create({
    data: { teamId: fx.team.id, channel: data.channel ?? "FORM", title: "t", description: "d", createdAt, requesterId: fx.actors.REQUESTER.id, ...data },
  });
}

describe.skipIf(!hasDb)("indicadores, resumos e manutenção (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("viz");
  });
  afterAll(() => db.$disconnect());

  it("calcula as métricas de sucesso do período", async () => {
    const base = new Date("2026-01-05T12:00:00Z");
    await ticketAt(base, { firstResponseAt: new Date(base.getTime() + hours(1)), resolvedAt: new Date(base.getTime() + hours(4)), status: "RESOLVED", category: "Rede", triagedByAgent: true, satisfaction: 5 });
    await ticketAt(base, { firstResponseAt: new Date(base.getTime() + hours(3)), status: "OPEN", category: "Rede", triagedByAgent: true });
    await ticketAt(base, { status: "OPEN", category: "Acesso" });
    // Chat resolvido pelo assistente e chat encaminhado.
    await ticketAt(base, { channel: "CHAT", status: "RESOLVED", resolvedAt: base, resolvedByAgent: true });
    await ticketAt(base, { channel: "CHAT", status: "OPEN", handoffAt: base });
    await db.aiUsage.create({ data: { teamId: fx.team.id, purpose: "triage", model: "x", inputTokens: 1, outputTokens: 1, costMicroUsd: 50_000, createdAt: base } });

    const m = await computeMetrics(fx.team.id, { from: new Date("2026-01-05T00:00:00Z"), to: new Date("2026-01-06T00:00:00Z") });
    expect(m).toMatchObject({
      tickets: 4, // 3 do formulário + 1 chat encaminhado
      resolved: 2,
      avgFirstResponseMin: 120,
      avgResolutionMin: 240,
      resolvedByAgentPct: 50,
      chatbotFirstLevelPct: 50,
      triagedPct: 50,
      satisfaction: 5,
      satisfactionCount: 1,
    });
    // US$ 0,05 × 5,40 = R$ 0,27 em 5 chamados.
    expect(m.aiCostBrl).toBeCloseTo(0.27, 2);
    expect(m.aiCostPerTicketBrl).toBeCloseTo(0.05, 2);

    await expect(dashboard(fx.actors.TECHNICIAN, 30)).rejects.toThrow(ForbiddenError);
    const d = await dashboard(fx.actors.COORDINATOR, 30);
    expect(d.perDay).toHaveLength(30);
    expect(d.baseline?.metrics?.tickets).toBe(4); // primeira semana = janeiro
  });

  it("períodos dos relatórios no fuso de Brasília", () => {
    // Quarta, 21/10/2026 às 09:00 em Brasília.
    const now = new Date("2026-10-21T12:00:00Z");
    expect(reportPeriod("DAILY", now)).toEqual({ from: new Date("2026-10-20T03:00:00Z"), to: new Date("2026-10-21T03:00:00Z") });
    expect(reportPeriod("WEEKLY", now)).toEqual({ from: new Date("2026-10-12T03:00:00Z"), to: new Date("2026-10-19T03:00:00Z") });
  });

  it("agente de resumo gera relatório uma vez por período e avisa a equipe", async () => {
    await db.agent.create({ data: { teamId: fx.team.id, type: "SUMMARY", active: true, dryRun: false } });
    const job = { id: "j", teamId: fx.team.id, payload: { period: "DAILY" } as never, attempts: 1 };
    await summaryJob(job);
    await summaryJob(job);
    const reports = await db.report.findMany({ where: { teamId: fx.team.id } });
    expect(reports).toHaveLength(1);
    expect(reports[0].content).toContain("Indicadores");
    expect((await jobsOf(fx.team.id, "notify.team")).some((j) => String((j.payload as { text: string }).text).startsWith("Resumo do dia"))).toBe(true);
  });

  it("retenção apaga chamados encerrados antigos e mantém o log", async () => {
    const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Antigo", description: "Chamado antigo", requester: { userId: fx.actors.REQUESTER.id } });
    await db.ticket.update({ where: { id: ticket.id }, data: { status: "CLOSED", resolvedAt: new Date(Date.now() - 400 * 86_400_000) } });
    const recent = await ticketAt(new Date(), { status: "RESOLVED", resolvedAt: new Date() });
    const purged = await purgeExpiredTickets(fx.team.id, 365);
    expect(purged).toBe(1);
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    expect(await db.card.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect(await db.ticket.findUnique({ where: { id: recent.id } })).not.toBeNull();
    expect(await db.action.count({ where: { targetId: ticket.id } })).toBeGreaterThan(0);
    expect(await db.action.count({ where: { teamId: fx.team.id, type: "retention.purge" } })).toBe(1);
  });

  it("encerra conversas paradas do chat sem contar como resolvidas", async () => {
    const idle = await ticketAt(new Date(Date.now() - 2 * 86_400_000), { channel: "CHAT", status: "OPEN" });
    await db.$executeRaw`UPDATE "Ticket" SET "updatedAt" = now() - interval '2 days' WHERE id = ${idle.id}`;
    expect(await closeIdleConversations(fx.team.id)).toBeGreaterThanOrEqual(1);
    expect(await db.ticket.findUniqueOrThrow({ where: { id: idle.id } })).toMatchObject({ status: "CLOSED", resolvedByAgent: false });
  });

  it("rotina diária enfileira o resumo sem duplicar no mesmo dia", async () => {
    const monday = new Date("2026-10-19T13:00:00Z");
    await runDailyMaintenance(monday);
    await runDailyMaintenance(monday);
    const summaries = (await jobsOf(fx.team.id, "agent.summary")).filter((j) => j.dedupeKey?.includes("2026-10-19"));
    expect(summaries.map((j) => (j.payload as { period: string }).period).sort()).toEqual(["DAILY", "WEEKLY"]);
  });

  it("vincula PR ao cartão pelo código e acompanha o estado", async () => {
    const card = await db.card.create({ data: { title: "Corrigir VPN", boardId: fx.board.id, columnId: fx.columnIds[0], position: 1 } });
    const code = `PLT-${card.id.slice(-8)}`;
    const url = "https://github.com/acme/infra/pull/42";
    expect(await syncPullRequest(fx.team.id, { provider: "github", url, title: "Ajusta MTU da VPN", state: "open", texts: [`Resolve ${code}`] })).toBe(1);
    // Evento seguinte sem o código no texto ainda atualiza o vínculo existente.
    await syncPullRequest(fx.team.id, { provider: "github", url, title: "Ajusta MTU da VPN", state: "merged", texts: [] });
    const link = await db.cardLink.findUniqueOrThrow({ where: { cardId_url: { cardId: card.id, url } } });
    expect(link.state).toBe("merged");
    expect((await jobsOf(fx.team.id, "notify.team")).some((j) => String((j.payload as { text: string }).text).includes("PR integrado"))).toBe(true);

    await linkCard(fx.actors.TECHNICIAN, card.id, "https://gitlab.com/acme/app/-/merge_requests/7");
    expect(await db.cardLink.count({ where: { cardId: card.id } })).toBe(2);
    await expect(linkCard(fx.actors.TECHNICIAN, card.id, "https://exemplo.com/qualquer")).rejects.toThrow();
  });
});
