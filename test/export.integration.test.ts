import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createTeamFixture, hasDb, jobsOf, testDb as db } from "./fixtures";
import * as tickets from "@/lib/tickets";
import * as boards from "@/lib/boards";
import { exportReportPdf, exportTickets } from "@/lib/export/service";
import { exportAuditCsv, exportAuditPdf, queryAudit } from "@/lib/audit-log";
import { notifyAssigneeJob, notifyRequesterJob } from "@/lib/notifications";
import { ForbiddenError } from "@/lib/permissions";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;

describe.skipIf(!hasDb)("exportação, auditoria e e-mail (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("ex");
    await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Teclado com defeito", description: "Teclas falhando", requester: { userId: fx.actors.REQUESTER.id } });
    await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "=SOMA(A1) tentativa de fórmula", description: "Detalhes do problema", priority: "URGENT", requester: { userId: fx.actors.REQUESTER.id } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(() => db.$disconnect());

  it("exporta chamados em CSV com filtros, só da equipe, e registra na auditoria", async () => {
    const other = await createTeamFixture("ex2");
    await tickets.createTicket({ teamId: other.team.id, channel: "FORM", title: "De outra equipe", description: "Detalhes do problema", requester: { userId: other.actors.REQUESTER.id } });

    const csv = await exportTickets(fx.actors.COORDINATOR, { status: "ACTIVE" }, "csv");
    const lines = csv.split("\n");
    expect(lines[0]).toContain("titulo");
    expect(lines).toHaveLength(3);
    expect(csv).toContain("Teclado com defeito");
    expect(csv).toContain(`"'=SOMA(A1)`);
    expect(csv).not.toContain("De outra equipe");

    const urgent = await exportTickets(fx.actors.ADMIN, { status: "ACTIVE", priority: "URGENT" }, "csv");
    expect(urgent.split("\n")).toHaveLength(2);

    const log = await db.action.findFirstOrThrow({ where: { teamId: fx.team.id, type: "ticket.export", userId: fx.actors.COORDINATOR.id } });
    expect(log.payload).toMatchObject({ format: "csv", count: 2 });
  });

  it("exporta chamados em PDF", async () => {
    const pdf = await exportTickets(fx.actors.COORDINATOR, { status: "ACTIVE" }, "pdf");
    expect((await PDFDocument.load(pdf)).getTitle()).toBe("Chamados");
  });

  it("técnico, auditor e solicitante não exportam chamados", async () => {
    for (const role of ["TECHNICIAN", "AUDITOR", "REQUESTER"] as const) {
      await expect(exportTickets(fx.actors[role], {}, "csv")).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("auditoria filtra por pessoa e tipo de alvo e exporta em CSV e PDF", async () => {
    const byCoordinator = await queryAudit(fx.actors.AUDITOR, { user: fx.actors.COORDINATOR.id, page: 1 });
    expect(byCoordinator.rows.length).toBeGreaterThan(0);
    expect(byCoordinator.rows.every((r) => r.userId === fx.actors.COORDINATOR.id)).toBe(true);

    const onTickets = await queryAudit(fx.actors.AUDITOR, { targetType: "ticket", page: 1 });
    expect(onTickets.rows.every((r) => r.targetType === "ticket")).toBe(true);

    const csv = await exportAuditCsv(fx.actors.ADMIN, { user: fx.actors.COORDINATOR.id, page: 1 });
    expect(csv).toContain("Exportou chamados");
    const pdf = await exportAuditPdf(fx.actors.AUDITOR, { page: 1 });
    expect((await PDFDocument.load(pdf)).getTitle()).toBe("Log de auditoria");
    await expect(exportAuditPdf(fx.actors.TECHNICIAN, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("baixa relatório em PDF só da própria equipe", async () => {
    const report = await db.report.create({
      data: { teamId: fx.team.id, period: "DAILY", periodStart: new Date("2026-10-21T03:00:00Z"), periodEnd: new Date("2026-10-22T03:00:00Z"), content: "# Resumo\n- 2 chamados" },
    });
    const { bytes, filename } = await exportReportPdf(fx.actors.COORDINATOR, report.id);
    expect(filename).toBe("relatorio-diario-2026-10-21.pdf");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    const other = await createTeamFixture("ex3");
    await expect(exportReportPdf(other.actors.ADMIN, report.id)).rejects.toThrow("não encontrado");
  });

  it("avisa por e-mail o solicitante do portal usando as variáveis de ambiente", async () => {
    vi.stubEnv("EMAIL_FROM", "ti@empresa.test");
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Mouse sumiu", description: "Detalhes do problema", requester: { userId: fx.actors.REQUESTER.id } });
    const message = await tickets.replyToTicket(fx.actors.TECHNICIAN, { ticketId: ticket.id, content: "Já levo outro" });
    await notifyRequesterJob({ id: "j", teamId: fx.team.id, payload: { messageId: message.id }, attempts: 1 });
    const sent = log.mock.calls.map((c) => String(c[0])).find((t) => t.startsWith("[email]"));
    expect(sent).toContain(`para requester-${fx.run}@teste.local`);
    expect(sent).toContain("Já levo outro");
    expect(sent).toContain("/acompanhar/");

    // Sem nenhum meio de envio configurado, não envia nada.
    vi.stubEnv("EMAIL_FROM", "");
    log.mockClear();
    await notifyRequesterJob({ id: "j", teamId: fx.team.id, payload: { messageId: message.id }, attempts: 1 });
    expect(log.mock.calls.some((c) => String(c[0]).startsWith("[email]"))).toBe(false);
  });

  it("avisa por e-mail quem foi definido como responsável", async () => {
    vi.stubEnv("EMAIL_FROM", "ti@empresa.test");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Monitor piscando", description: "Detalhes do problema", requester: { userId: fx.actors.REQUESTER.id } });
    const card = await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } });

    // Atribuir a si mesmo não gera aviso.
    await boards.updateCard(fx.actors.COORDINATOR, { cardId: card.id, assigneeId: fx.actors.COORDINATOR.id });
    expect((await jobsOf(fx.team.id, "notify.assignee")).filter((j) => (j.payload as { cardId: string }).cardId === card.id)).toHaveLength(0);

    await boards.updateCard(fx.actors.COORDINATOR, { cardId: card.id, assigneeId: fx.actors.TECHNICIAN.id });
    const [job] = (await jobsOf(fx.team.id, "notify.assignee")).filter((j) => (j.payload as { cardId: string }).cardId === card.id);
    expect(job.payload).toMatchObject({ assigneeId: fx.actors.TECHNICIAN.id, byUserId: fx.actors.COORDINATOR.id });
    await notifyAssigneeJob(job);
    const sent = log.mock.calls.map((c) => String(c[0])).find((t) => t.startsWith("[email]"));
    expect(sent).toContain(`para technician-${fx.run}@teste.local`);
    expect(sent).toContain("Monitor piscando");

    // Reatribuído antes do envio: o aviso antigo é descartado.
    await boards.updateCard(fx.actors.COORDINATOR, { cardId: card.id, assigneeId: fx.actors.ADMIN.id });
    log.mockClear();
    await notifyAssigneeJob(job);
    expect(log.mock.calls.some((c) => String(c[0]).startsWith("[email]"))).toBe(false);
  });
});
