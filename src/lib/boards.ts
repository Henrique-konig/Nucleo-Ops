import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { needsRebalance, positionAt, rebalanced } from "@/lib/ordering";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessError, NotFoundError, type Actor } from "@/lib/errors";
import { applyStatus } from "@/lib/tickets";
import { runColumnAutomations } from "@/lib/automations";
import { customAgentOptions, queueAgentRun } from "@/lib/custom-agents";
import { boardFilterSchema, cleanFilter } from "@/lib/board-filters";
import { DEFAULT_COLUMNS } from "@/lib/team-defaults";

// Regras do quadro de tarefas. Cada operação valida permissão e equipe, e grava
// a mudança e o registro de auditoria na mesma transação.

export { NotFoundError, type Actor } from "@/lib/errors";

const cardInclude = {
  assignee: { select: { id: true, name: true } },
  agent: { select: { id: true, name: true, color: true } },
  labels: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } },
  checklist: { select: { id: true, text: true, done: true, position: true }, orderBy: { position: "asc" } },
  ticket: { select: { id: true, priority: true, status: true, channel: true } },
  links: { select: { id: true, url: true, title: true, state: true, provider: true }, orderBy: { updatedAt: "desc" } },
} satisfies Prisma.CardInclude;

export async function getBoard(actor: Actor, boardId: string) {
  assertCan(actor.role, "board:view");
  const board = await db.board.findFirst({
    where: { id: boardId, teamId: actor.teamId },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          cards: { where: { archivedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: cardInclude },
        },
      },
    },
  });
  if (!board) throw new NotFoundError("Quadro");
  return board;
}

export type BoardData = Awaited<ReturnType<typeof getBoard>>;
export type BoardCard = BoardData["columns"][number]["cards"][number];

export async function listBoards(actor: Actor) {
  assertCan(actor.role, "board:view");
  const boards = await db.board.findMany({
    where: { teamId: actor.teamId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { columns: true, cards: { where: { archivedAt: null } } } } },
  });
  const [overdue, mine] = await Promise.all([
    db.card.groupBy({ by: ["boardId"], where: { board: { teamId: actor.teamId }, archivedAt: null, dueDate: { lt: new Date() } }, _count: true }),
    db.card.groupBy({ by: ["boardId"], where: { board: { teamId: actor.teamId }, archivedAt: null, assigneeId: actor.id }, _count: true }),
  ]);
  // Sem quadro marcado como entrada, o mais antigo recebe os chamados.
  const intakeId = (boards.find((b) => b.intake) ?? boards[0])?.id;
  return boards.map(({ _count, ...b }) => ({
    ...b,
    isIntake: b.id === intakeId,
    columnCount: _count.columns,
    cardCount: _count.cards,
    overdueCount: overdue.find((o) => o.boardId === b.id)?._count ?? 0,
    mineCount: mine.find((o) => o.boardId === b.id)?._count ?? 0,
  }));
}

export type BoardSummary = Awaited<ReturnType<typeof listBoards>>[number];

export async function getBoardOptions(actor: Actor) {
  const [members, labels, agents, boards] = await Promise.all([
    db.user.findMany({
      where: { teamId: actor.teamId, active: true, role: { in: ["TECHNICIAN", "COORDINATOR", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.label.findMany({ where: { teamId: actor.teamId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    customAgentOptions(actor),
    db.board.findMany({ where: { teamId: actor.teamId }, select: { id: true, name: true, color: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return { members, labels, agents, boards };
}

// ---------------------------------------------------------------------------
// Validação de entrada

const id = z.string().min(1).max(64);

export const BOARD_COLORS = ["brand", "sky", "emerald", "amber", "rose", "violet", "slate"] as const;
const title = z.string().trim().min(1, "Informe um título").max(200);
const name = z.string().trim().min(1, "Informe um nome").max(60);

export const schemas = {
  createCard: z.object({ boardId: id, columnId: id, title }),
  moveCard: z.object({ cardId: id, toColumnId: id, toIndex: z.number().int().min(0) }),
  updateCard: z.object({
    cardId: id,
    title: title.optional(),
    description: z.string().max(10_000).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    assigneeId: id.nullable().optional(),
    agentId: id.nullable().optional(),
    labelIds: z.array(id).max(20).optional(),
  }),
  archiveCard: z.object({ cardId: id }),
  addChecklistItem: z.object({ cardId: id, text: z.string().trim().min(1).max(300) }),
  toggleChecklistItem: z.object({ itemId: id, done: z.boolean() }),
  deleteChecklistItem: z.object({ itemId: id }),
  createColumn: z.object({ boardId: id, name }),
  renameColumn: z.object({ columnId: id, name }),
  moveColumn: z.object({ columnId: id, toIndex: z.number().int().min(0) }),
  deleteColumn: z.object({ columnId: id }),
  setColumnTicketStatus: z.object({
    columnId: id,
    ticketStatus: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]).nullable(),
  }),
  createLabel: z.object({ name: z.string().trim().min(1).max(40), color: z.enum(["slate", "red", "amber", "green", "sky", "violet", "pink"]) }),
  createBoard: z.object({
    name,
    description: z.string().trim().max(300).optional(),
    color: z.enum(BOARD_COLORS).default("brand"),
    // Colunas iniciais: as padrão do atendimento, nenhuma, ou copiadas de outro quadro.
    template: z.enum(["default", "blank", "copy"]).default("default"),
    copyFromBoardId: id.optional(),
  }),
  updateBoard: z.object({
    boardId: id,
    name,
    description: z.string().trim().max(300).nullable().optional(),
    color: z.enum(BOARD_COLORS),
  }),
  setIntakeBoard: z.object({ boardId: id }),
  deleteBoard: z.object({ boardId: id }),
  moveCardToBoard: z.object({ cardId: id, boardId: id }),
  saveFilter: z.object({ boardId: id, name: z.string().trim().min(1, "Dê um nome ao filtro").max(40), filters: boardFilterSchema, shared: z.boolean().default(false) }),
  deleteFilter: z.object({ filterId: id }),
};

type Input<K extends keyof typeof schemas> = z.input<(typeof schemas)[K]>;

// ---------------------------------------------------------------------------
// Helpers

async function findCard(tx: Prisma.TransactionClient, actor: Actor, cardId: string) {
  const card = await tx.card.findFirst({ where: { id: cardId, board: { teamId: actor.teamId }, archivedAt: null } });
  if (!card) throw new NotFoundError("Cartão");
  return card;
}

async function findColumn(tx: Prisma.TransactionClient, actor: Actor, columnId: string) {
  const column = await tx.column.findFirst({ where: { id: columnId, board: { teamId: actor.teamId } } });
  if (!column) throw new NotFoundError("Coluna");
  return column;
}

async function rebalanceIfNeeded(tx: Prisma.TransactionClient, list: { id: string; position: number }[], table: "card" | "column") {
  if (!needsRebalance(list)) return;
  for (const { id, position } of rebalanced(list)) {
    if (table === "card") await tx.card.update({ where: { id }, data: { position } });
    else await tx.column.update({ where: { id }, data: { position } });
  }
}

// ---------------------------------------------------------------------------
// Cartões

export async function createCard(actor: Actor, input: Input<"createCard">) {
  assertCan(actor.role, "card:create");
  const data = schemas.createCard.parse(input);
  return db.$transaction(async (tx) => {
    const column = await findColumn(tx, actor, data.columnId);
    if (column.boardId !== data.boardId) throw new NotFoundError("Coluna");
    const last = await tx.card.findFirst({ where: { columnId: column.id, archivedAt: null }, orderBy: { position: "desc" } });
    const card = await tx.card.create({
      data: { title: data.title, boardId: column.boardId, columnId: column.id, position: positionAt(last ? [last] : [], 1) },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "card.create", targetType: "card", targetId: card.id,
      payload: { title: card.title, columnId: column.id },
    });
    return card;
  });
}

export async function moveCard(actor: Actor, input: Input<"moveCard">) {
  assertCan(actor.role, "card:move");
  const data = schemas.moveCard.parse(input);
  return db.$transaction(async (tx) => {
    const card = await findCard(tx, actor, data.cardId);
    const toColumn = await findColumn(tx, actor, data.toColumnId);
    if (toColumn.boardId !== card.boardId) throw new NotFoundError("Coluna");

    const siblings = await tx.card.findMany({
      where: { columnId: toColumn.id, archivedAt: null, id: { not: card.id } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    const position = positionAt(siblings, data.toIndex);
    const moved = await tx.card.update({ where: { id: card.id }, data: { columnId: toColumn.id, position } });

    const ordered = [...siblings];
    ordered.splice(Math.min(data.toIndex, ordered.length), 0, { id: moved.id, position });
    await rebalanceIfNeeded(tx, ordered, "card");

    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "card.move", targetType: "card", targetId: card.id,
      payload: { fromColumnId: card.columnId, toColumnId: toColumn.id, toIndex: data.toIndex },
    });

    if (card.columnId !== toColumn.id) {
      // A coluna pode definir o status do chamado (ex.: "Concluído" → resolvido).
      if (card.ticketId && toColumn.ticketStatus) {
        const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: card.ticketId } });
        await applyStatus(tx, ticket, toColumn.ticketStatus, actor.id, { moveCard: false, byAgent: false });
      }
      await runColumnAutomations(tx, { cardId: card.id, columnId: toColumn.id, teamId: actor.teamId });
    }
    return moved;
  });
}

export async function updateCard(actor: Actor, input: Input<"updateCard">) {
  assertCan(actor.role, "card:edit");
  const { cardId, labelIds, ...fields } = schemas.updateCard.parse(input);
  return db.$transaction(async (tx) => {
    const card = await tx.card.findFirst({
      where: { id: cardId, board: { teamId: actor.teamId }, archivedAt: null },
      include: { labels: { select: { id: true } } },
    });
    if (!card) throw new NotFoundError("Cartão");

    if (fields.assigneeId !== undefined && fields.assigneeId !== card.assigneeId) {
      assertCan(actor.role, "card:assign");
      if (fields.assigneeId) {
        const member = await tx.user.findFirst({ where: { id: fields.assigneeId, teamId: actor.teamId, active: true } });
        if (!member) throw new NotFoundError("Responsável");
      }
    }
    if (labelIds) {
      const count = await tx.label.count({ where: { id: { in: labelIds }, teamId: actor.teamId } });
      if (count !== new Set(labelIds).size) throw new NotFoundError("Etiqueta");
    }
    let agentToRun: string | null = null;
    if (fields.agentId !== undefined && fields.agentId !== card.agentId && fields.agentId) {
      const agent = await tx.customAgent.findFirst({ where: { id: fields.agentId, teamId: actor.teamId } });
      if (!agent) throw new NotFoundError("Agente");
      if (!agent.active) throw new BusinessError(`O agente ${agent.name} está desligado`);
      if (agent.runOnAssign) agentToRun = agent.id;
    }

    const updated = await tx.card.update({
      where: { id: card.id },
      data: { ...fields, ...(labelIds && { labels: { set: labelIds.map((id) => ({ id })) } }) },
    });

    // Registra só o que mudou, com valor anterior e novo.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const before = card[key] instanceof Date ? (card[key] as Date).toISOString() : card[key];
      const after = fields[key] instanceof Date ? (fields[key] as Date).toISOString() : fields[key];
      if (before !== after) changes[key] = { from: before ?? null, to: after ?? null };
    }
    if (labelIds) {
      const before = card.labels.map((l) => l.id).sort();
      const after = [...new Set(labelIds)].sort();
      if (before.join() !== after.join()) changes.labelIds = { from: before, to: after };
    }
    if (Object.keys(changes).length > 0) {
      await recordAction(tx, {
        teamId: actor.teamId, userId: actor.id, type: "card.update", targetType: "card", targetId: card.id,
        payload: changes as Prisma.InputJsonValue,
      });
    }
    // Agente recém-atribuído começa a trabalhar no cartão.
    if (agentToRun) await queueAgentRun(tx, { teamId: actor.teamId, agentId: agentToRun, cardId: card.id, requestedById: actor.id });
    return updated;
  });
}

export async function archiveCard(actor: Actor, input: Input<"archiveCard">) {
  assertCan(actor.role, "card:edit");
  const data = schemas.archiveCard.parse(input);
  return db.$transaction(async (tx) => {
    const card = await findCard(tx, actor, data.cardId);
    await tx.card.update({ where: { id: card.id }, data: { archivedAt: new Date() } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "card.archive", targetType: "card", targetId: card.id });
  });
}

// ---------------------------------------------------------------------------
// Checklist

export async function addChecklistItem(actor: Actor, input: Input<"addChecklistItem">) {
  assertCan(actor.role, "card:edit");
  const data = schemas.addChecklistItem.parse(input);
  return db.$transaction(async (tx) => {
    const card = await findCard(tx, actor, data.cardId);
    const last = await tx.checklistItem.findFirst({ where: { cardId: card.id }, orderBy: { position: "desc" } });
    const item = await tx.checklistItem.create({ data: { cardId: card.id, text: data.text, position: positionAt(last ? [last] : [], 1) } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "checklist.add", targetType: "checklist_item", targetId: item.id,
      payload: { cardId: card.id, text: item.text },
    });
    return item;
  });
}

async function findChecklistItem(tx: Prisma.TransactionClient, actor: Actor, itemId: string) {
  const item = await tx.checklistItem.findFirst({ where: { id: itemId, card: { board: { teamId: actor.teamId }, archivedAt: null } } });
  if (!item) throw new NotFoundError("Item");
  return item;
}

export async function toggleChecklistItem(actor: Actor, input: Input<"toggleChecklistItem">) {
  assertCan(actor.role, "card:edit");
  const data = schemas.toggleChecklistItem.parse(input);
  return db.$transaction(async (tx) => {
    const item = await findChecklistItem(tx, actor, data.itemId);
    if (item.done === data.done) return item;
    const updated = await tx.checklistItem.update({ where: { id: item.id }, data: { done: data.done } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: data.done ? "checklist.check" : "checklist.uncheck",
      targetType: "checklist_item", targetId: item.id, payload: { cardId: item.cardId },
    });
    return updated;
  });
}

export async function deleteChecklistItem(actor: Actor, input: Input<"deleteChecklistItem">) {
  assertCan(actor.role, "card:edit");
  const data = schemas.deleteChecklistItem.parse(input);
  return db.$transaction(async (tx) => {
    const item = await findChecklistItem(tx, actor, data.itemId);
    await tx.checklistItem.delete({ where: { id: item.id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "checklist.delete", targetType: "checklist_item", targetId: item.id,
      payload: { cardId: item.cardId, text: item.text },
    });
  });
}

// ---------------------------------------------------------------------------
// Colunas e etiquetas

export async function createColumn(actor: Actor, input: Input<"createColumn">) {
  assertCan(actor.role, "column:manage");
  const data = schemas.createColumn.parse(input);
  return db.$transaction(async (tx) => {
    const board = await tx.board.findFirst({ where: { id: data.boardId, teamId: actor.teamId } });
    if (!board) throw new NotFoundError("Quadro");
    const last = await tx.column.findFirst({ where: { boardId: board.id }, orderBy: { position: "desc" } });
    const column = await tx.column.create({ data: { boardId: board.id, name: data.name, position: positionAt(last ? [last] : [], 1) } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "column.create", targetType: "column", targetId: column.id,
      payload: { name: column.name, boardId: board.id },
    });
    return column;
  });
}

export async function renameColumn(actor: Actor, input: Input<"renameColumn">) {
  assertCan(actor.role, "column:manage");
  const data = schemas.renameColumn.parse(input);
  return db.$transaction(async (tx) => {
    const column = await findColumn(tx, actor, data.columnId);
    if (column.name === data.name) return column;
    const updated = await tx.column.update({ where: { id: column.id }, data: { name: data.name } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "column.rename", targetType: "column", targetId: column.id,
      payload: { from: column.name, to: data.name },
    });
    return updated;
  });
}

export async function moveColumn(actor: Actor, input: Input<"moveColumn">) {
  assertCan(actor.role, "column:manage");
  const data = schemas.moveColumn.parse(input);
  return db.$transaction(async (tx) => {
    const column = await findColumn(tx, actor, data.columnId);
    const siblings = await tx.column.findMany({
      where: { boardId: column.boardId, id: { not: column.id } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    const position = positionAt(siblings, data.toIndex);
    await tx.column.update({ where: { id: column.id }, data: { position } });
    const ordered = [...siblings];
    ordered.splice(Math.min(data.toIndex, ordered.length), 0, { id: column.id, position });
    await rebalanceIfNeeded(tx, ordered, "column");
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "column.move", targetType: "column", targetId: column.id,
      payload: { toIndex: data.toIndex },
    });
  });
}

export async function deleteColumn(actor: Actor, input: Input<"deleteColumn">) {
  assertCan(actor.role, "column:manage");
  const data = schemas.deleteColumn.parse(input);
  return db.$transaction(async (tx) => {
    const column = await findColumn(tx, actor, data.columnId);
    // Cartões arquivados também contam: a coluna guarda o histórico deles.
    if ((await tx.card.count({ where: { columnId: column.id } })) > 0) {
      throw new BusinessError("Só é possível excluir colunas sem cartões");
    }
    await tx.column.delete({ where: { id: column.id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "column.delete", targetType: "column", targetId: column.id,
      payload: { name: column.name },
    });
  });
}

export async function setColumnTicketStatus(actor: Actor, input: Input<"setColumnTicketStatus">) {
  assertCan(actor.role, "column:manage");
  const data = schemas.setColumnTicketStatus.parse(input);
  return db.$transaction(async (tx) => {
    const column = await findColumn(tx, actor, data.columnId);
    if (column.ticketStatus === data.ticketStatus) return;
    await tx.column.update({ where: { id: column.id }, data: { ticketStatus: data.ticketStatus } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "column.ticket_status", targetType: "column", targetId: column.id,
      payload: { from: column.ticketStatus, to: data.ticketStatus },
    });
  });
}

export async function createLabel(actor: Actor, input: Input<"createLabel">) {
  assertCan(actor.role, "card:edit");
  const data = schemas.createLabel.parse(input);
  return db.$transaction(async (tx) => {
    const label = await tx.label.create({ data: { teamId: actor.teamId, name: data.name, color: data.color } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "label.create", targetType: "label", targetId: label.id,
      payload: { name: label.name, color: label.color },
    });
    return label;
  });
}

// ---------------------------------------------------------------------------
// Quadros

export async function createBoard(actor: Actor, input: Input<"createBoard">) {
  assertCan(actor.role, "board:manage");
  const data = schemas.createBoard.parse(input);
  return db.$transaction(async (tx) => {
    let columns: { name: string; ticketStatus: Prisma.ColumnCreateWithoutBoardInput["ticketStatus"] }[] = [];
    if (data.template === "default") columns = DEFAULT_COLUMNS;
    if (data.template === "copy") {
      const source = data.copyFromBoardId
        ? await tx.board.findFirst({ where: { id: data.copyFromBoardId, teamId: actor.teamId }, include: { columns: { orderBy: { position: "asc" } } } })
        : null;
      if (!source) throw new NotFoundError("Quadro de origem");
      columns = source.columns.map((c) => ({ name: c.name, ticketStatus: c.ticketStatus }));
    }
    const board = await tx.board.create({
      data: {
        teamId: actor.teamId,
        name: data.name,
        description: data.description || null,
        color: data.color,
        columns: { create: columns.map((c, i) => ({ name: c.name, ticketStatus: c.ticketStatus, position: (i + 1) * 1024 })) },
      },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "board.create", targetType: "board", targetId: board.id,
      payload: { name: board.name, template: data.template, ...(data.copyFromBoardId && { copyFromBoardId: data.copyFromBoardId }) },
    });
    return board;
  });
}

export async function updateBoard(actor: Actor, input: Input<"updateBoard">) {
  assertCan(actor.role, "board:manage");
  const { boardId, ...fields } = schemas.updateBoard.parse(input);
  return db.$transaction(async (tx) => {
    const board = await tx.board.findFirst({ where: { id: boardId, teamId: actor.teamId } });
    if (!board) throw new NotFoundError("Quadro");
    const next = { name: fields.name, description: fields.description || null, color: fields.color };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (board[key] !== next[key]) changes[key] = { from: board[key], to: next[key] };
    }
    if (Object.keys(changes).length === 0) return board;
    const updated = await tx.board.update({ where: { id: board.id }, data: next });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "board.update", targetType: "board", targetId: board.id,
      payload: changes as Prisma.InputJsonValue,
    });
    return updated;
  });
}

/** Define o quadro que recebe os cartões dos chamados novos. */
export async function setIntakeBoard(actor: Actor, input: Input<"setIntakeBoard">) {
  assertCan(actor.role, "board:manage");
  const data = schemas.setIntakeBoard.parse(input);
  return db.$transaction(async (tx) => {
    const board = await tx.board.findFirst({ where: { id: data.boardId, teamId: actor.teamId } });
    if (!board) throw new NotFoundError("Quadro");
    if ((await tx.column.count({ where: { boardId: board.id } })) === 0) {
      throw new BusinessError("Crie ao menos uma coluna antes: os chamados entram na primeira");
    }
    await tx.board.updateMany({ where: { teamId: actor.teamId, intake: true }, data: { intake: false } });
    await tx.board.update({ where: { id: board.id }, data: { intake: true } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "board.intake", targetType: "board", targetId: board.id });
  });
}

/**
 * Exclui um quadro sem cartões ativos. Os cartões arquivados vão para outro quadro,
 * para que o histórico deles continue existindo.
 */
export async function deleteBoard(actor: Actor, input: Input<"deleteBoard">) {
  assertCan(actor.role, "board:manage");
  const data = schemas.deleteBoard.parse(input);
  return db.$transaction(async (tx) => {
    const board = await tx.board.findFirst({ where: { id: data.boardId, teamId: actor.teamId } });
    if (!board) throw new NotFoundError("Quadro");
    if ((await tx.card.count({ where: { boardId: board.id, archivedAt: null } })) > 0) {
      throw new BusinessError("Mova ou arquive os cartões antes de excluir o quadro");
    }
    const others = await tx.board.findMany({
      where: { teamId: actor.teamId, id: { not: board.id } },
      orderBy: [{ intake: "desc" }, { createdAt: "asc" }],
      include: { columns: { orderBy: { position: "asc" }, take: 1 } },
    });
    if (others.length === 0) throw new BusinessError("A equipe precisa de pelo menos um quadro");

    const archived = await tx.card.count({ where: { boardId: board.id } });
    if (archived > 0) {
      const target = others.find((b) => b.columns.length > 0);
      if (!target) throw new BusinessError("Nenhum outro quadro tem colunas para guardar os cartões arquivados");
      await tx.card.updateMany({ where: { boardId: board.id }, data: { boardId: target.id, columnId: target.columns[0].id } });
    }
    await tx.board.delete({ where: { id: board.id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "board.delete", targetType: "board", targetId: board.id,
      payload: { name: board.name, archivedCardsMoved: archived },
    });
  });
}

/** Leva o cartão para o fim da primeira coluna de outro quadro. */
export async function moveCardToBoard(actor: Actor, input: Input<"moveCardToBoard">) {
  assertCan(actor.role, "card:move");
  const data = schemas.moveCardToBoard.parse(input);
  return db.$transaction(async (tx) => {
    const card = await findCard(tx, actor, data.cardId);
    if (card.boardId === data.boardId) return card;
    const toColumn = await tx.column.findFirst({ where: { boardId: data.boardId, board: { teamId: actor.teamId } }, orderBy: { position: "asc" } });
    if (!toColumn) {
      if (!(await tx.board.findFirst({ where: { id: data.boardId, teamId: actor.teamId } }))) throw new NotFoundError("Quadro");
      throw new BusinessError("O quadro de destino não tem colunas");
    }
    const last = await tx.card.findFirst({ where: { columnId: toColumn.id, archivedAt: null }, orderBy: { position: "desc" } });
    const moved = await tx.card.update({
      where: { id: card.id },
      data: { boardId: toColumn.boardId, columnId: toColumn.id, position: positionAt(last ? [last] : [], 1) },
    });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "card.move_board", targetType: "card", targetId: card.id,
      payload: { fromBoardId: card.boardId, toBoardId: toColumn.boardId, toColumnId: toColumn.id },
    });
    if (card.ticketId && toColumn.ticketStatus) {
      const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: card.ticketId } });
      await applyStatus(tx, ticket, toColumn.ticketStatus, actor.id, { moveCard: false, byAgent: false });
    }
    await runColumnAutomations(tx, { cardId: card.id, columnId: toColumn.id, teamId: actor.teamId });
    return moved;
  });
}

// ---------------------------------------------------------------------------
// Filtros salvos

/** Os filtros da pessoa e os compartilhados pela equipe neste quadro. */
export async function listSavedFilters(actor: Actor, boardId: string) {
  assertCan(actor.role, "board:view");
  const rows = await db.savedFilter.findMany({
    where: { boardId, board: { teamId: actor.teamId }, OR: [{ userId: actor.id }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shared: r.shared,
    mine: r.userId === actor.id,
    owner: r.user.name,
    filters: boardFilterSchema.catch({}).parse(r.filters),
  }));
}

export type SavedFilterItem = Awaited<ReturnType<typeof listSavedFilters>>[number];

export async function saveFilter(actor: Actor, input: Input<"saveFilter">) {
  assertCan(actor.role, "board:view");
  const data = schemas.saveFilter.parse(input);
  // Compartilhar com a equipe é decisão de quem organiza o quadro.
  if (data.shared) assertCan(actor.role, "column:manage");
  const filters = cleanFilter(data.filters);
  if (Object.keys(filters).length === 0) throw new BusinessError("Escolha ao menos um critério antes de salvar");
  return db.$transaction(async (tx) => {
    const board = await tx.board.findFirst({ where: { id: data.boardId, teamId: actor.teamId } });
    if (!board) throw new NotFoundError("Quadro");
    if ((await tx.savedFilter.count({ where: { boardId: board.id, userId: actor.id } })) >= 20) {
      throw new BusinessError("Limite de 20 filtros por quadro");
    }
    const saved = await tx.savedFilter.create({
      data: { boardId: board.id, userId: actor.id, name: data.name, filters, shared: data.shared },
    });
    if (saved.shared) {
      await recordAction(tx, {
        teamId: actor.teamId, userId: actor.id, type: "filter.share", targetType: "saved_filter", targetId: saved.id,
        payload: { boardId: board.id, name: saved.name, filters },
      });
    }
    return { id: saved.id, name: saved.name, shared: saved.shared, mine: true, owner: "", filters };
  });
}

export async function deleteFilter(actor: Actor, input: Input<"deleteFilter">) {
  assertCan(actor.role, "board:view");
  const data = schemas.deleteFilter.parse(input);
  return db.$transaction(async (tx) => {
    const filter = await tx.savedFilter.findFirst({ where: { id: data.filterId, board: { teamId: actor.teamId } } });
    if (!filter) throw new NotFoundError("Filtro");
    // O filtro compartilhado pode ser removido por quem organiza o quadro.
    if (filter.userId !== actor.id) {
      if (!filter.shared) throw new NotFoundError("Filtro");
      assertCan(actor.role, "column:manage");
    }
    await tx.savedFilter.delete({ where: { id: filter.id } });
    if (filter.shared) {
      await recordAction(tx, {
        teamId: actor.teamId, userId: actor.id, type: "filter.delete", targetType: "saved_filter", targetId: filter.id,
        payload: { boardId: filter.boardId, name: filter.name },
      });
    }
  });
}
