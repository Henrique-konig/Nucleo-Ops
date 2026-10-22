import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { needsRebalance, positionAt, rebalanced } from "@/lib/ordering";
import type { Prisma } from "@/generated/prisma/client";

// Regras do quadro de tarefas. Cada operação valida permissão e equipe, e grava
// a mudança e o registro de auditoria na mesma transação.

export type Actor = { id: string; role: Parameters<typeof assertCan>[0]; teamId: string };

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado`);
    this.name = "NotFoundError";
  }
}

const cardInclude = {
  assignee: { select: { id: true, name: true } },
  labels: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } },
  checklist: { select: { id: true, text: true, done: true, position: true }, orderBy: { position: "asc" } },
  ticket: { select: { id: true, priority: true, status: true, channel: true } },
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
  return db.board.findMany({ where: { teamId: actor.teamId }, orderBy: { createdAt: "asc" } });
}

export async function getBoardOptions(actor: Actor) {
  const [members, labels] = await Promise.all([
    db.user.findMany({
      where: { teamId: actor.teamId, active: true, role: { in: ["TECHNICIAN", "COORDINATOR", "ADMIN"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.label.findMany({ where: { teamId: actor.teamId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  return { members, labels };
}

// ---------------------------------------------------------------------------
// Validação de entrada

const id = z.string().min(1).max(64);
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
  createLabel: z.object({ name: z.string().trim().min(1).max(40), color: z.enum(["slate", "red", "amber", "green", "sky", "violet", "pink"]) }),
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
      throw new Error("Só é possível excluir colunas sem cartões");
    }
    await tx.column.delete({ where: { id: column.id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "column.delete", targetType: "column", targetId: column.id,
      payload: { name: column.name },
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
