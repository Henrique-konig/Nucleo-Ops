// Testes contra um Postgres real (local ou branch do Neon) com as migrações aplicadas.
// Pulados quando DATABASE_URL não está definida.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createPrismaClient } from "@/lib/prisma-client";
import * as boards from "@/lib/boards";
import { ForbiddenError } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

const hasDb = Boolean(process.env.DATABASE_URL);
const db = hasDb ? createPrismaClient() : (null as never);
const run = Math.random().toString(36).slice(2, 8);

let teamId: string;
let otherTeamId: string;
let boardId: string;
let columnIds: string[];
const actors = {} as Record<Role, boards.Actor>;

describe.skipIf(!hasDb)("quadro (integração)", () => {
  beforeAll(async () => {
    const team = await db.team.create({ data: { name: `teste-${run}` } });
    const other = await db.team.create({ data: { name: `outra-${run}` } });
    teamId = team.id;
    otherTeamId = other.id;
    for (const role of ["REQUESTER", "TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"] as Role[]) {
      const u = await db.user.create({ data: { name: role, email: `${role.toLowerCase()}-${run}@teste.local`, role, teamId } });
      actors[role] = { id: u.id, role, teamId };
    }
    const board = await db.board.create({
      data: {
        name: "Teste",
        teamId,
        columns: { create: ["A", "B", "C"].map((name, i) => ({ name, position: (i + 1) * 1024 })) },
      },
      include: { columns: { orderBy: { position: "asc" } } },
    });
    boardId = board.id;
    columnIds = board.columns.map((c) => c.id);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const titles = async (columnIndex: number) =>
    (await boards.getBoard(actors.TECHNICIAN, boardId)).columns[columnIndex].cards.map((c) => c.title);

  it("cria cartões no fim da coluna e registra a ação", async () => {
    const tech = actors.TECHNICIAN;
    const c1 = await boards.createCard(tech, { boardId, columnId: columnIds[0], title: "um" });
    await boards.createCard(tech, { boardId, columnId: columnIds[0], title: "dois" });
    await boards.createCard(tech, { boardId, columnId: columnIds[0], title: "três" });
    expect(await titles(0)).toEqual(["um", "dois", "três"]);

    const log = await db.action.findMany({ where: { targetId: c1.id } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: "card.create", userId: tech.id, targetType: "card" });
  });

  it("move cartões entre colunas e dentro da coluna", async () => {
    const tech = actors.TECHNICIAN;
    const board = await boards.getBoard(tech, boardId);
    const [um, dois] = board.columns[0].cards;

    await boards.moveCard(tech, { cardId: um.id, toColumnId: columnIds[1], toIndex: 0 });
    expect(await titles(0)).toEqual(["dois", "três"]);
    expect(await titles(1)).toEqual(["um"]);

    // toIndex conta a posição entre os outros cartões da coluna de destino.
    await boards.moveCard(tech, { cardId: dois.id, toColumnId: columnIds[0], toIndex: 1 });
    expect(await titles(0)).toEqual(["três", "dois"]);

    const moves = await db.action.findMany({ where: { targetId: um.id, type: "card.move" } });
    expect(moves[0].payload).toMatchObject({ fromColumnId: columnIds[0], toColumnId: columnIds[1] });
  });

  it("aplica as permissões por papel", async () => {
    const card = (await boards.getBoard(actors.TECHNICIAN, boardId)).columns[0].cards[0];
    await expect(boards.moveCard(actors.AUDITOR, { cardId: card.id, toColumnId: columnIds[2], toIndex: 0 })).rejects.toThrow(ForbiddenError);
    await expect(boards.getBoard(actors.REQUESTER, boardId)).rejects.toThrow(ForbiddenError);
    await expect(boards.createColumn(actors.TECHNICIAN, { boardId, name: "X" })).rejects.toThrow(ForbiddenError);
    // Técnico edita o cartão, mas só coordenador atribui responsável.
    await expect(boards.updateCard(actors.TECHNICIAN, { cardId: card.id, assigneeId: actors.TECHNICIAN.id })).rejects.toThrow(ForbiddenError);
    await boards.updateCard(actors.COORDINATOR, { cardId: card.id, assigneeId: actors.TECHNICIAN.id });
    await boards.updateCard(actors.TECHNICIAN, { cardId: card.id, title: "três (editado)", assigneeId: actors.TECHNICIAN.id });
    const updated = await db.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(updated).toMatchObject({ title: "três (editado)", assigneeId: actors.TECHNICIAN.id });
  });

  it("isola equipes", async () => {
    const outsider: boards.Actor = { ...actors.ADMIN, teamId: otherTeamId };
    const card = (await boards.getBoard(actors.TECHNICIAN, boardId)).columns[0].cards[0];
    await expect(boards.getBoard(outsider, boardId)).rejects.toThrow(boards.NotFoundError);
    await expect(boards.archiveCard(outsider, { cardId: card.id })).rejects.toThrow(boards.NotFoundError);
  });

  it("registra no log só os campos alterados", async () => {
    const card = (await boards.getBoard(actors.TECHNICIAN, boardId)).columns[1].cards[0];
    await boards.updateCard(actors.TECHNICIAN, { cardId: card.id, title: card.title, description: "detalhes" });
    const last = await db.action.findFirstOrThrow({ where: { targetId: card.id, type: "card.update" }, orderBy: { createdAt: "desc" } });
    expect(last.payload).toEqual({ description: { from: null, to: "detalhes" } });
  });

  it("checklist e arquivamento", async () => {
    const tech = actors.TECHNICIAN;
    const card = (await boards.getBoard(tech, boardId)).columns[1].cards[0];
    const item = await boards.addChecklistItem(tech, { cardId: card.id, text: "verificar logs" });
    await boards.toggleChecklistItem(tech, { itemId: item.id, done: true });
    expect((await db.checklistItem.findUniqueOrThrow({ where: { id: item.id } })).done).toBe(true);

    await boards.archiveCard(tech, { cardId: card.id });
    expect(await titles(1)).toEqual([]);
    await expect(boards.deleteColumn(actors.COORDINATOR, { columnId: columnIds[1] })).rejects.toThrow(/sem cartões/);
  });

  it("move e renomeia colunas", async () => {
    const coord = actors.COORDINATOR;
    await boards.moveColumn(coord, { columnId: columnIds[2], toIndex: 0 });
    await boards.renameColumn(coord, { columnId: columnIds[2], name: "Primeira" });
    const names = (await boards.getBoard(coord, boardId)).columns.map((c) => c.name);
    expect(names).toEqual(["Primeira", "A", "B"]);
  });

  describe("regras no banco", () => {
    it("Action é append-only", async () => {
      const action = await db.action.findFirstOrThrow({ where: { teamId } });
      await expect(db.action.update({ where: { id: action.id }, data: { type: "x" } })).rejects.toThrow(/append-only/);
      await expect(db.action.delete({ where: { id: action.id } })).rejects.toThrow(/append-only/);
    });

    it("Action exige exatamente um autor", async () => {
      const agent = await db.agent.create({ data: { teamId, type: "TRIAGE" } });
      const base = { teamId, type: "t", targetType: "card", targetId: "x" };
      await expect(db.action.create({ data: base })).rejects.toThrow();
      await expect(db.action.create({ data: { ...base, userId: actors.ADMIN.id, agentId: agent.id } })).rejects.toThrow();
      await expect(db.action.create({ data: { ...base, agentId: agent.id } })).resolves.toBeTruthy();
    });

    it("chamado é único por equipe, canal e identificador externo", async () => {
      const base = { teamId, title: "t", description: "d", externalId: `msg-${run}` };
      await db.ticket.create({ data: { ...base, channel: "EMAIL" } });
      await expect(db.ticket.create({ data: { ...base, channel: "EMAIL" } })).rejects.toThrow();
      // Outro canal com o mesmo id e chamados sem id externo são permitidos.
      await db.ticket.create({ data: { ...base, channel: "WEBHOOK" } });
      await db.ticket.create({ data: { teamId, title: "f1", description: "d", channel: "FORM" } });
      await db.ticket.create({ data: { teamId, title: "f2", description: "d", channel: "FORM" } });
    });

    it("avisa mudanças do quadro por NOTIFY", async () => {
      const listener = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
      await listener.connect();
      try {
        await listener.query("LISTEN plantao_board");
        const received = new Promise<string>((resolve) => listener.on("notification", (m) => resolve(m.payload!)));
        await boards.createCard(actors.TECHNICIAN, { boardId, columnId: columnIds[0], title: "notify" });
        await expect(received).resolves.toBe(boardId);
      } finally {
        await listener.end();
      }
    });

    it("busca semântica com pgvector via SQL bruto", async () => {
      const vec = (hot: number) => `[${Array.from({ length: 1024 }, (_, i) => (i === hot ? 1 : 0)).join(",")}]`;
      const ids: string[] = [];
      for (const [title, hot] of [["VPN", 0], ["Impressora", 1]] as const) {
        const doc = await db.document.create({ data: { teamId, title, content: title } });
        await db.$executeRaw`UPDATE "Document" SET embedding = ${vec(hot)}::vector WHERE id = ${doc.id}`;
        ids.push(doc.id);
      }
      const rows = await db.$queryRaw<{ title: string }[]>`
        SELECT title FROM "Document" WHERE "teamId" = ${teamId}
        ORDER BY embedding <=> ${vec(1)}::vector LIMIT 1`;
      expect(rows[0].title).toBe("Impressora");
    });
  });
});
