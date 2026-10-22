import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, jobsOf, testDb as db } from "./fixtures";
import { getActiveConversation, requestHuman, resolveConversation, sendChatMessage } from "@/lib/chatbot";
import { runAnonymousCommand, runUserCommand } from "@/lib/commands";
import { setAiProvider } from "@/lib/ai";
import { LocalProvider } from "@/lib/ai/local";
import { listRequesterTickets, listTickets } from "@/lib/tickets";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;
let requester: { id: string; teamId: string; name: string };

describe.skipIf(!hasDb)("chatbot e comandos (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("chat");
    requester = { id: fx.actors.REQUESTER.id, teamId: fx.team.id, name: "Solicitante" };
    await db.agent.create({ data: { teamId: fx.team.id, type: "CHATBOT", active: true, dryRun: false } });
    await db.agent.create({ data: { teamId: fx.team.id, type: "TRIAGE", active: true, dryRun: false } });
    await db.document.create({
      data: { teamId: fx.team.id, title: "Como redefinir a senha de rede", content: "Acesse o portal de senha, informe seu e-mail corporativo e clique em redefinir senha. A nova senha vale para VPN e Wi-Fi." },
    });
  });
  afterEach(() => setAiProvider(null));
  afterAll(() => db.$disconnect());

  it("responde pela base, sem cartão nem fila, e conta como resolvido pelo assistente", async () => {
    const r = await sendChatMessage(requester, "Como faço para redefinir minha senha de rede?");
    expect(r.handoff).toBe(false);
    const conv = (await getActiveConversation(requester))!;
    expect(conv.messages.map((m) => Boolean(m.agentId))).toEqual([false, true]);
    expect(conv.messages[1].content).toContain("portal de senha");
    expect(await db.card.count({ where: { ticketId: r.ticketId } })).toBe(0);
    expect((await listTickets(fx.actors.TECHNICIAN, {})).some((t) => t.id === r.ticketId)).toBe(false);
    expect((await listRequesterTickets(requester.id)).some((t) => t.id === r.ticketId)).toBe(false);

    // Segunda mensagem continua a mesma conversa.
    const r2 = await sendChatMessage(requester, "E vale para a VPN também? senha");
    expect(r2.ticketId).toBe(r.ticketId);

    await resolveConversation(requester, r.ticketId);
    expect(await db.ticket.findUniqueOrThrow({ where: { id: r.ticketId } })).toMatchObject({ status: "RESOLVED", resolvedByAgent: true });
    expect(await getActiveConversation(requester)).toBeNull();
  });

  it("passa para humano com contexto: cartão, triagem e conversa preservada", async () => {
    const r = await sendChatMessage(requester, "Meu notebook não liga de jeito nenhum");
    await requestHuman(requester, r.ticketId);
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: r.ticketId }, include: { card: true, messages: true } });
    expect(ticket.handoffAt).not.toBeNull();
    expect(ticket.card?.columnId).toBe(fx.columnIds[0]);
    expect(ticket.messages.length).toBeGreaterThanOrEqual(3);
    expect((await jobsOf(fx.team.id, "ticket.handoff")).some((j) => (j.payload as { ticketId: string }).ticketId === r.ticketId)).toBe(true);
    expect((await listTickets(fx.actors.TECHNICIAN, {})).some((t) => t.id === r.ticketId)).toBe(true);
  });

  it("falha do modelo leva a conversa para a equipe", async () => {
    setAiProvider({ ...new LocalProvider(), chat: async () => { throw new Error("indisponível"); } } as never);
    const r = await sendChatMessage(requester, "Preciso de acesso ao sistema de compras");
    expect(r.handoff).toBe(true);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: r.ticketId } })).handoffAt).not.toBeNull();
  });

  it("comandos: abrir, status, responder e fila com permissões", async () => {
    const user = { ...fx.actors.REQUESTER, name: "Req" };
    const opened = await runUserCommand(user, "abrir Monitor piscando | O monitor pisca a cada minuto", "SLACK");
    expect(opened).toMatch(/Chamado #[a-z0-9]{8} aberto/);
    const short = /#([a-z0-9]{8})/.exec(opened)![1];
    const ticket = await db.ticket.findFirstOrThrow({ where: { id: { endsWith: short } } });
    expect(ticket).toMatchObject({ channel: "SLACK", requesterId: user.id, title: "Monitor piscando" });

    expect(await runUserCommand(user, "status", "SLACK")).toContain("Monitor piscando");
    expect(await runUserCommand(user, `responder ${short} Agora apagou de vez`, "SLACK")).toContain("registrada");
    expect(await runUserCommand(user, "fila", "SLACK")).toContain("só para a equipe");

    const tech = { ...fx.actors.TECHNICIAN, name: "Tec" };
    expect(await runUserCommand(tech, "fila", "SLACK")).toMatch(/chamado\(s\) em aberto/);
    expect(await runUserCommand(tech, `responder ${short} Vou trocar o cabo`, "SLACK")).toContain("registrada");
    expect(await db.message.count({ where: { ticketId: ticket.id, authorId: tech.id } })).toBe(1);

    // Outro solicitante não vê nem escreve no chamado alheio.
    const other = await db.user.create({ data: { name: "Outro", email: `outro-${fx.run}@teste.local`, role: "REQUESTER", teamId: fx.team.id } });
    const otherUser = { id: other.id, teamId: fx.team.id, role: other.role, name: other.name };
    expect(await runUserCommand(otherUser, `status ${short}`, "SLACK")).toBe("Chamado não encontrado.");
    expect(await runUserCommand(otherUser, `responder ${short} oi`, "SLACK")).toBe("Chamado não encontrado.");

    expect(await runAnonymousCommand(fx.team.id, `status ${short}`)).toContain("Monitor piscando");
    expect(await runAnonymousCommand(fx.team.id, "abrir algo")).toContain("Comandos no Teams");
  });
});
