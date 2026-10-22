import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, jobsOf, testDb as db } from "./fixtures";
import * as tickets from "@/lib/tickets";
import * as boards from "@/lib/boards";
import { handleInboundEmail } from "@/lib/inbound";
import { ForbiddenError } from "@/lib/permissions";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;

describe.skipIf(!hasDb)("chamados (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("tk");
  });
  afterAll(() => db.$disconnect());

  it("abre pelo formulário com cartão na entrada, mensagem e tarefa de abertura", async () => {
    const { ticket, created } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Impressora não imprime", description: "Fila travada desde cedo",
      requester: { userId: fx.actors.REQUESTER.id },
    });
    expect(created).toBe(true);
    const card = await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } });
    expect(card.columnId).toBe(fx.columnIds[0]);
    expect(await db.message.count({ where: { ticketId: ticket.id } })).toBe(1);
    expect((await jobsOf(fx.team.id, "ticket.created")).some((j) => (j.payload as { ticketId: string }).ticketId === ticket.id)).toBe(true);
    const log = await db.action.findMany({ where: { targetId: ticket.id } });
    expect(log.map((a) => a.type)).toContain("ticket.create");
  });

  it("é idempotente por canal e identificador externo", async () => {
    const input = {
      teamId: fx.team.id, channel: "EMAIL" as const, externalId: `<abc-${fx.run}@mail>`, title: "VPN caiu", description: "Não conecta na VPN",
      requester: { email: `Pessoa.${fx.run}@Empresa.com`, name: "Pessoa" },
    };
    const [a, b] = await Promise.all([tickets.createTicket(input), tickets.createTicket(input)]);
    expect(a.ticket.id).toBe(b.ticket.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    // O solicitante por e-mail ganha conta de solicitante, sem senha.
    const requester = await db.user.findUniqueOrThrow({ where: { email: `pessoa.${fx.run}@empresa.com` } });
    expect(requester).toMatchObject({ role: "REQUESTER", passwordHash: null, teamId: fx.team.id });
  });

  it("mover o cartão para uma coluna com status atualiza o chamado e avisa o solicitante", async () => {
    const { ticket } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Senha expirada", description: "Preciso trocar a senha",
      requester: { userId: fx.actors.REQUESTER.id },
    });
    const card = await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } });
    await boards.moveCard(fx.actors.TECHNICIAN, { cardId: card.id, toColumnId: fx.columnIds[3], toIndex: 0 });
    const updated = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(updated.status).toBe("RESOLVED");
    expect(updated.resolvedAt).not.toBeNull();
    const system = await db.message.findFirstOrThrow({ where: { ticketId: ticket.id, authorId: null }, orderBy: { createdAt: "desc" } });
    expect(system.content).toContain("Resolvido");
    const notify = await jobsOf(fx.team.id, "notify.requester");
    expect(notify.some((j) => (j.payload as { messageId: string }).messageId === system.id)).toBe(true);

    // Coluna sem status ligado não muda o chamado.
    await boards.moveCard(fx.actors.TECHNICIAN, { cardId: card.id, toColumnId: fx.columnIds[2], toIndex: 0 });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("RESOLVED");
  });

  it("mudar o status no chamado leva o cartão para a coluna ligada", async () => {
    const { ticket } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Teclado", description: "Teclas falhando",
      requester: { userId: fx.actors.REQUESTER.id },
    });
    await tickets.setTicketStatus(fx.actors.TECHNICIAN, { ticketId: ticket.id, status: "IN_PROGRESS" });
    expect((await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } })).columnId).toBe(fx.columnIds[1]);
    await expect(tickets.setTicketStatus(fx.actors.AUDITOR, { ticketId: ticket.id, status: "CLOSED" })).rejects.toThrow(ForbiddenError);
  });

  it("resposta pública marca a primeira resposta; nota interna não vai ao solicitante", async () => {
    const { ticket } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Monitor", description: "Monitor piscando",
      requester: { userId: fx.actors.REQUESTER.id },
    });
    await tickets.replyToTicket(fx.actors.TECHNICIAN, { ticketId: ticket.id, content: "Verificando cabo", internal: true });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).firstResponseAt).toBeNull();
    await tickets.replyToTicket(fx.actors.TECHNICIAN, { ticketId: ticket.id, content: "Pode testar outro cabo?" });
    const after = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.firstResponseAt).not.toBeNull();
    expect(after.status).toBe("IN_PROGRESS");

    const view = await tickets.getTicketForRequester({ id: ticket.id, requesterId: fx.actors.REQUESTER.id });
    expect(view.messages.some((m) => m.content === "Verificando cabo")).toBe(false);
  });

  it("mensagem do solicitante reabre chamado resolvido; avaliação só depois de resolvido", async () => {
    const { ticket } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Wi-Fi", description: "Sem sinal na sala 3",
      requester: { userId: fx.actors.REQUESTER.id },
    });
    await expect(tickets.rateTicket({ id: ticket.id, requesterId: fx.actors.REQUESTER.id }, 5)).rejects.toThrow(/resolvidos/);
    await tickets.setTicketStatus(fx.actors.TECHNICIAN, { ticketId: ticket.id, status: "RESOLVED" });
    await tickets.rateTicket({ id: ticket.id, requesterId: fx.actors.REQUESTER.id }, 4);
    await tickets.addRequesterMessage(ticket.id, { userId: fx.actors.REQUESTER.id }, "Voltou a cair");
    const reopened = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(reopened).toMatchObject({ status: "OPEN", satisfaction: 4, resolvedAt: null });
    expect((await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } })).columnId).toBe(fx.columnIds[0]);
    // Outro usuário não fala pelo solicitante.
    await expect(tickets.addRequesterMessage(ticket.id, { userId: fx.actors.TECHNICIAN.id }, "x")).rejects.toThrow(ForbiddenError);
  });

  it("e-mail: abre chamado, encadeia resposta pelo assunto e ignora remetente diferente", async () => {
    const from = { email: `email-${fx.run}@empresa.com`, name: "Fulano" };
    const first = await handleInboundEmail(fx.team.id, { from, subject: "Acesso ao ERP", text: "Não consigo entrar no ERP", messageId: `<m1-${fx.run}>` });
    expect(first.created).toBe(true);
    const short = first.ticketId.slice(-8);

    const reply = await handleInboundEmail(fx.team.id, {
      from, subject: `Re: [Plantão #${short}] Acesso ao ERP`, text: "Ainda não funciona\n\nEm seg., fulano escreveu:\n> texto antigo", messageId: `<m2-${fx.run}>`,
    });
    expect(reply).toMatchObject({ ticketId: first.ticketId, created: false });
    const msg = await db.message.findFirstOrThrow({ where: { externalId: `<m2-${fx.run}>` } });
    expect(msg.content).toBe("Ainda não funciona");

    // Reentrega do mesmo e-mail não duplica a mensagem.
    await handleInboundEmail(fx.team.id, { from, subject: `Re: [Plantão #${short}] Acesso ao ERP`, text: "Ainda não funciona", messageId: `<m2-${fx.run}>` });
    expect(await db.message.count({ where: { externalId: `<m2-${fx.run}>` } })).toBe(1);

    const intruder = await handleInboundEmail(fx.team.id, {
      from: { email: `outro-${fx.run}@empresa.com` }, subject: `Re: [Plantão #${short}] Acesso ao ERP`, text: "Mensagem de terceiro", messageId: `<m3-${fx.run}>`, inReplyTo: `<m1-${fx.run}>`,
    });
    expect(intruder.ticketId).not.toBe(first.ticketId);
  });
});
