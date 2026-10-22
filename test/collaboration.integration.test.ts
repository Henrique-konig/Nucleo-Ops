// Comentários, menções, anexos, notificações, feed de atividades e carga por pessoa.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createTeamFixture, hasDb, testDb as db } from "./fixtures";
import * as boards from "@/lib/boards";
import * as tickets from "@/lib/tickets";
import * as collaboration from "@/lib/collaboration";
import { listNotifications, markNotificationsRead } from "@/lib/inbox";
import { mentionToken } from "@/lib/mentions";
import { workload, byStatus } from "@/lib/metrics";
import { ForbiddenError } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;
let other: Awaited<ReturnType<typeof createTeamFixture>>;

const notificationsOf = (userId: string) => db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe.skipIf(!hasDb)("colaboração nos cartões (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("col");
    other = await createTeamFixture("col-outra");
  });
  afterAll(() => db.$disconnect());

  it("comenta com menção, avisa o mencionado e o responsável e registra a ação", async () => {
    const { TECHNICIAN: tech, COORDINATOR: coord, ADMIN: admin } = fx.actors;
    const card = await boards.createCard(tech, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Trocar switch" });
    await boards.updateCard(admin, { cardId: card.id, assigneeId: tech.id });
    expect((await notificationsOf(tech.id)).map((n) => n.type)).toEqual(["ASSIGNED"]);

    const outsider = other.actors.TECHNICIAN.id;
    const comment = await collaboration.addComment(coord, {
      cardId: card.id,
      content: `${mentionToken("Admin", admin.id)} pode aprovar? ${mentionToken("Fora", outsider)}`,
    });
    // Menção a alguém de outra equipe é ignorada.
    expect(comment.mentionIds).toEqual([admin.id]);
    expect(await notificationsOf(outsider)).toHaveLength(0);

    const [mention] = await notificationsOf(admin.id);
    expect(mention).toMatchObject({ type: "MENTION", actorId: coord.id, cardId: card.id, href: `/boards/${fx.board.id}?cartao=${card.id}` });
    expect(mention.body).toBe("@Admin pode aprovar? @Fora");
    expect((await notificationsOf(tech.id)).map((n) => n.type)).toEqual(["ASSIGNED", "COMMENT"]);

    const log = await db.action.findFirstOrThrow({ where: { targetId: comment.id } });
    expect(log).toMatchObject({ type: "comment.add", targetType: "comment", userId: coord.id });

    // Quem comenta no próprio cartão não recebe aviso de si mesmo.
    await collaboration.addComment(tech, { cardId: card.id, content: "Feito" });
    expect(await notificationsOf(tech.id)).toHaveLength(2);

    const details = await collaboration.getCardDetails(tech, card.id);
    expect(details.comments.map((c) => c.content)).toHaveLength(2);
    expect(details.activity.map((a) => a.type)).toEqual(expect.arrayContaining(["card.create", "card.update", "comment.add"]));
  });

  it("só o autor edita; edição avisa só quem foi mencionado agora; coordenação modera", async () => {
    const { TECHNICIAN: tech, COORDINATOR: coord, ADMIN: admin, AUDITOR: auditor } = fx.actors;
    const card = await boards.createCard(tech, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Editar" });
    const comment = await collaboration.addComment(tech, { cardId: card.id, content: `oi ${mentionToken("A", admin.id)}` });
    const before = (await notificationsOf(coord.id)).length;

    await expect(collaboration.editComment(coord, { commentId: comment.id, content: "outro" })).rejects.toBeInstanceOf(BusinessError);
    await collaboration.editComment(tech, { commentId: comment.id, content: `oi ${mentionToken("A", admin.id)} e ${mentionToken("C", coord.id)}` });
    expect(await notificationsOf(coord.id)).toHaveLength(before + 1);
    expect((await notificationsOf(admin.id)).filter((n) => n.cardId === card.id)).toHaveLength(1);

    await expect(collaboration.addComment(auditor, { cardId: card.id, content: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await collaboration.deleteComment(coord, { commentId: comment.id });
    expect((await collaboration.getCardDetails(tech, card.id)).comments).toHaveLength(0);
    // A linha continua no banco para a auditoria.
    expect(await db.cardComment.count({ where: { id: comment.id } })).toBe(1);
  });

  it("anexa, baixa e remove arquivos, respeitando limite e equipe", async () => {
    const { TECHNICIAN: tech, AUDITOR: auditor } = fx.actors;
    const card = await boards.createCard(tech, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Com anexo" });
    const file = new File(["log de erro"], "erro.txt", { type: "text/plain" });
    const att = await collaboration.addAttachment(tech, card.id, file);
    expect(att).toMatchObject({ filename: "erro.txt", size: 11, contentType: "text/plain" });

    const download = await collaboration.getAttachmentFile(auditor, att.id);
    expect(Buffer.from(download.data).toString()).toBe("log de erro");
    expect(download.inline).toBe(true);
    await expect(collaboration.getAttachmentFile(other.actors.TECHNICIAN, att.id)).rejects.toThrow("não encontrad");

    const big = new File([new Uint8Array(collaboration.MAX_ATTACHMENT_BYTES + 1)], "grande.bin");
    await expect(collaboration.addAttachment(tech, card.id, big)).rejects.toThrow("4 MB");
    await expect(collaboration.addAttachment(auditor, card.id, file)).rejects.toBeInstanceOf(ForbiddenError);

    const html = await collaboration.addAttachment(tech, card.id, new File(["<script>"], "x.html", { type: "text/html" }));
    expect((await collaboration.getAttachmentFile(tech, html.id)).inline).toBe(false);

    await collaboration.deleteAttachment(tech, { attachmentId: att.id });
    const details = await collaboration.getCardDetails(tech, card.id);
    expect(details.attachments.map((a) => a.filename)).toEqual(["x.html"]);
    expect(details.activity.map((a) => a.text)).toEqual(expect.arrayContaining(["anexou erro.txt", "removeu o anexo erro.txt"]));
  });

  it("avisa o responsável quando o solicitante responde e mostra o feed do chamado", async () => {
    const { TECHNICIAN: tech, ADMIN: admin, REQUESTER: requester } = fx.actors;
    const { ticket } = await tickets.createTicket({
      teamId: fx.team.id, channel: "FORM", title: "Sem internet", description: "Cabo ok", requester: { userId: requester.id },
    });
    const card = await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } });
    await boards.updateCard(admin, { cardId: card.id, assigneeId: tech.id });
    await boards.moveCard(tech, { cardId: card.id, toColumnId: fx.columnIds[1], toIndex: 0 });
    await tickets.addRequesterMessage(ticket.id, { userId: requester.id }, "Voltou a cair agora");

    const reply = (await notificationsOf(tech.id)).find((n) => n.type === "TICKET_REPLY");
    expect(reply).toMatchObject({ ticketId: ticket.id, href: `/chamados/${ticket.id}`, body: "Voltou a cair agora" });

    const feed = await collaboration.ticketActivity(tech, ticket.id);
    const texts = feed.map((a) => a.text);
    expect(texts).toEqual(expect.arrayContaining(["abriu o chamado", "moveu para Em andamento", "mudou o status para Em andamento", "enviou uma mensagem"]));
    // Do mais recente para o mais antigo.
    expect(feed[feed.length - 1].at.getTime()).toBeLessThanOrEqual(feed[0].at.getTime());
    await expect(collaboration.ticketActivity(other.actors.TECHNICIAN, ticket.id)).rejects.toThrow();
  });

  it("lista, marca como lidas e avisa em tempo real pelo canal da pessoa", async () => {
    const { TECHNICIAN: tech, COORDINATOR: coord } = fx.actors;
    const listener = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
    await listener.connect();
    try {
      await listener.query("LISTEN plantao_user");
      const received = new Promise<string>((resolve) => listener.on("notification", (m) => m.payload === coord.id && resolve(m.payload)));
      const card = await boards.createCard(tech, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Tempo real" });
      await collaboration.addComment(tech, { cardId: card.id, content: `${mentionToken("Coord", coord.id)} olha` });
      await expect(received).resolves.toBe(coord.id);
    } finally {
      await listener.end();
    }

    const inbox = await listNotifications(coord);
    expect(inbox.unread).toBeGreaterThan(0);
    expect(inbox.items[0].actor?.name).toBe((await db.user.findUniqueOrThrow({ where: { id: tech.id } })).name);
    await markNotificationsRead(coord, { ids: [inbox.items[0].id] });
    expect((await listNotifications(coord)).unread).toBe(inbox.unread - 1);
    await markNotificationsRead(coord, {});
    expect((await listNotifications(coord)).unread).toBe(0);
    // Ninguém marca as notificações de outra pessoa.
    expect(await markNotificationsRead(tech, { ids: [inbox.items[1]?.id ?? "x"] })).toBe(0);
  });

  it("calcula a carga por pessoa e os chamados por status", async () => {
    const team = await createTeamFixture("carga");
    const { TECHNICIAN: tech, ADMIN: admin, REQUESTER: requester } = team.actors;
    const period = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000) };

    const open = await tickets.createTicket({ teamId: team.team.id, channel: "FORM", title: "Aberto", description: "Sem acesso", priority: "URGENT", requester: { userId: requester.id } });
    const done = await tickets.createTicket({ teamId: team.team.id, channel: "FORM", title: "Resolvido", description: "Sem acesso", requester: { userId: requester.id } });
    for (const t of [open.ticket, done.ticket]) {
      const card = await db.card.findUniqueOrThrow({ where: { ticketId: t.id } });
      await boards.updateCard(admin, { cardId: card.id, assigneeId: tech.id });
    }
    const doneCard = await db.card.findUniqueOrThrow({ where: { ticketId: done.ticket.id } });
    await boards.moveCard(tech, { cardId: doneCard.id, toColumnId: team.columnIds[3], toIndex: 0 });
    // Cartão sem chamado, atrasado, numa coluna que não encerra.
    const task = await boards.createCard(tech, { boardId: team.board.id, columnId: team.columnIds[2], title: "Tarefa" });
    await boards.updateCard(admin, { cardId: task.id, assigneeId: tech.id, dueDate: new Date(Date.now() - 86_400_000) });

    const rows = await workload(team.team.id, period);
    const mine = rows.find((r) => r.userId === tech.id)!;
    expect(mine).toMatchObject({ open: 2, urgent: 1, overdue: 1, resolved: 1 });
    expect(mine.avgResolutionMin).not.toBeNull();
    expect(rows.find((r) => r.userId === admin.id)).toMatchObject({ open: 0, resolved: 0, avgResolutionMin: null });

    expect(await byStatus(team.team.id, period)).toEqual([{ label: "Aberto", value: 1 }, { label: "Resolvido", value: 1 }]);
  });
});
