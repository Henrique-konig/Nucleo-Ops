import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, testDb as db } from "./fixtures";
import * as tickets from "@/lib/tickets";
import { decideExecution, proposeExecution, proposeExecutionJob, runExecutionJob } from "@/lib/execution/service";
import { createIntegration, createUser, stopAgent, updateAgent, updateUser } from "@/lib/admin";
import { exportAuditCsv } from "@/lib/audit-log";
import { hmacSha256Hex } from "@/lib/channels/signature";
import { openIntegrationConfig } from "@/lib/integrations";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;
let agentId: string;
let server: Server;
let received: { body: string; signature: string | undefined }[] = [];
let executorStatus = 200;

const job = (payload: object) => ({ id: "j", teamId: fx.team.id, payload: payload as never, attempts: 1 });

async function setAgent(data: { active?: boolean; dryRun?: boolean; allowed?: string[] }) {
  await updateAgent(fx.actors.ADMIN, agentId, {
    active: data.active ?? true, dryRun: data.dryRun ?? false, perMinute: 100, perDay: 1000,
    allowedActions: data.allowed ?? ["reset_password", "unlock_account", "restart_service", "create_user"],
  });
}

describe.skipIf(!hasDb)("execução e administração (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("exec");
    agentId = (await db.agent.create({ data: { teamId: fx.team.id, type: "EXECUTION" } })).id;
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, signature: req.headers["x-plantao-signature"] as string | undefined });
        res.writeHead(executorStatus, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: executorStatus === 200 }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    await createIntegration(fx.actors.ADMIN, "AUTOMATION", "Executor", { url: `http://127.0.0.1:${port}/run`, secret: "segredo-do-executor-123" });
  });
  afterAll(async () => {
    server.close();
    await db.$disconnect();
  });

  it("só aceita ações da lista de permitidas e com parâmetros válidos", async () => {
    await setAgent({ allowed: ["reset_password"] });
    await expect(proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "restart_service", params: { host: "srv1", service: "nginx" } })).rejects.toThrow(/permitidas/);
    await expect(proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "reset_password", params: { email: "não é e-mail" } })).rejects.toThrow();
    await expect(proposeExecution(fx.actors.AUDITOR, { ticketId: null, actionKey: "reset_password", params: { email: "a@b.com" } })).rejects.toThrow(/Sem permissão/);
  });

  it("confirmação humana, simulação e execução assinada", async () => {
    await setAgent({ dryRun: true });
    const sim = await proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "reset_password", params: { email: "ana@empresa.com" } });
    // Sem confirmação, nada roda.
    await runExecutionJob(job({ requestId: sim.id }));
    expect((await db.executionRequest.findUniqueOrThrow({ where: { id: sim.id } })).status).toBe("PROPOSED");
    // Ação não sensível: outro técnico pode confirmar.
    await decideExecution(fx.actors.TECHNICIAN, sim.id, true);
    await runExecutionJob(job({ requestId: sim.id }));
    expect((await db.executionRequest.findUniqueOrThrow({ where: { id: sim.id } })).status).toBe("SIMULATED");
    expect(received).toHaveLength(0);

    await setAgent({ dryRun: false });
    const real = await proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "unlock_account", params: { email: "ana@empresa.com" } });
    await decideExecution(fx.actors.COORDINATOR, real.id, true);
    await runExecutionJob(job({ requestId: real.id }));
    const done = await db.executionRequest.findUniqueOrThrow({ where: { id: real.id } });
    expect(done.status).toBe("EXECUTED");
    expect(received).toHaveLength(1);
    expect(received[0].signature).toBe(`sha256=${hmacSha256Hex("segredo-do-executor-123", received[0].body)}`);
    expect(JSON.parse(received[0].body)).toMatchObject({ action: "unlock_account", params: { email: "ana@empresa.com" }, dryRun: false });
    const log = await db.action.findFirstOrThrow({ where: { targetId: real.id, type: "execution.executed" } });
    expect(log).toMatchObject({ agentId, confirmedById: fx.actors.COORDINATOR.id });
  });

  it("ações sensíveis: só coordenador/admin, e nunca quem propôs", async () => {
    await setAgent({ dryRun: false });
    const req = await proposeExecution(fx.actors.COORDINATOR, { ticketId: null, actionKey: "restart_service", params: { host: "srv-web-01", service: "nginx" } });
    await expect(decideExecution(fx.actors.TECHNICIAN, req.id, true)).rejects.toThrow(/coordenador ou administrador/);
    await expect(decideExecution(fx.actors.COORDINATOR, req.id, true)).rejects.toThrow(/outra pessoa/);
    await decideExecution(fx.actors.ADMIN, req.id, true);
    await expect(decideExecution(fx.actors.ADMIN, req.id, true)).rejects.toThrow(/já foi decidida/);
  });

  it("falha do executor não repete a ação e conta falha do agente", async () => {
    executorStatus = 500;
    const req = await proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "reset_password", params: { email: "bia@empresa.com" } });
    await decideExecution(fx.actors.COORDINATOR, req.id, true);
    await expect(runExecutionJob(job({ requestId: req.id }))).rejects.toThrow(/500/);
    expect((await db.executionRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("FAILED");
    expect((await db.agent.findUniqueOrThrow({ where: { id: agentId } })).consecutiveFailures).toBe(1);
    executorStatus = 200;
  });

  it("parada imediata cancela o que está pendente e impede execução", async () => {
    await setAgent({ dryRun: false });
    const pending = await proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "reset_password", params: { email: "c@empresa.com" } });
    const approved = await proposeExecution(fx.actors.TECHNICIAN, { ticketId: null, actionKey: "reset_password", params: { email: "d@empresa.com" } });
    await decideExecution(fx.actors.COORDINATOR, approved.id, true);
    await stopAgent(fx.actors.ADMIN, agentId);
    for (const id of [pending.id, approved.id]) expect((await db.executionRequest.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
    const count = received.length;
    await runExecutionJob(job({ requestId: approved.id }));
    expect(received.length).toBe(count);
    expect((await db.agent.findUniqueOrThrow({ where: { id: agentId } })).pausedReason).toContain("Parado");
  });

  it("agente sugere ação do catálogo a partir do chamado (provedor local)", async () => {
    await setAgent({ dryRun: true, allowed: ["reset_password"] });
    const { ticket } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Preciso redefinir a senha", description: "Minha senha expirou, meu e-mail é joao@empresa.com",
      requester: { userId: fx.actors.REQUESTER.id },
    });
    await proposeExecutionJob(job({ ticketId: ticket.id }));
    const proposal = await db.executionRequest.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(proposal).toMatchObject({ actionKey: "reset_password", params: { email: "joao@empresa.com" }, status: "PROPOSED", proposedByAgentId: agentId, dryRun: true });
  });

  it("administração: usuário com senha temporária, sem rebaixar a si mesmo", async () => {
    const { id, password } = await createUser(fx.actors.ADMIN, { name: "Novo Técnico", email: `novo-${fx.run}@teste.local`, role: "TECHNICIAN" });
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).passwordHash).not.toContain(password);
    await expect(updateUser(fx.actors.ADMIN, fx.actors.ADMIN.id, { active: false })).rejects.toThrow(/próprio acesso/);
    await updateUser(fx.actors.ADMIN, id, { role: "COORDINATOR" });
    expect((await db.user.findUniqueOrThrow({ where: { id } })).role).toBe("COORDINATOR");
    await expect(createUser(fx.actors.COORDINATOR, { name: "x", email: "x@y.com", role: "ADMIN" })).rejects.toThrow(/Sem permissão/);
  });

  it("integrações: segredo gerado e configuração cifrada", async () => {
    const created = await createIntegration(fx.actors.ADMIN, "WEBHOOK", "ERP", {});
    const secret = Object.values(created.generated)[0];
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    const row = await db.integration.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.configEncrypted).not.toContain(secret);
    expect(openIntegrationConfig("WEBHOOK", row.configEncrypted).secret).toBe(secret);
    expect(created.inboundUrl).toContain(`/api/inbound/webhook/${created.id}`);
  });

  it("CSV da auditoria neutraliza fórmulas", async () => {
    await db.action.create({ data: { teamId: fx.team.id, userId: fx.actors.ADMIN.id, type: "teste.csv", targetType: "team", targetId: "=HYPERLINK(1)" } });
    const csv = await exportAuditCsv(fx.actors.AUDITOR, { page: 1, type: "teste.csv" });
    expect(csv.split("\n")[0]).toContain("acao");
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});
