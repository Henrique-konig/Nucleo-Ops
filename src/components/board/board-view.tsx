"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardCard, BoardData } from "@/lib/boards";
import * as actions from "@/app/(app)/boards/[boardId]/actions";
import { CardDialog } from "./card-dialog";
import { LABEL_COLORS, type LabelOption, type MemberOption } from "./shared";

export type BoardPermissions = {
  createCard: boolean;
  editCard: boolean;
  moveCard: boolean;
  assign: boolean;
  manageColumns: boolean;
};

type Column = BoardData["columns"][number];

type Props = {
  board: BoardData;
  members: MemberOption[];
  labels: LabelOption[];
  permissions: BoardPermissions;
};

/** Move o cartão localmente, para a interface responder antes do servidor. */
function moveLocally(columns: Column[], cardId: string, toColumnId: string, toIndex: number): Column[] {
  let moving: BoardCard | undefined;
  const without = columns.map((col) => {
    const card = col.cards.find((c) => c.id === cardId);
    if (!card) return col;
    moving = card;
    return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
  });
  if (!moving) return columns;
  return without.map((col) => {
    if (col.id !== toColumnId) return col;
    const cards = [...col.cards];
    cards.splice(Math.min(toIndex, cards.length), 0, { ...moving!, columnId: toColumnId });
    return { ...col, cards };
  });
}

export function BoardView({ board, members, labels, permissions }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState(board.columns);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null);
  const [live, setLive] = useState<"connecting" | "online" | "offline">("connecting");
  const [, startTransition] = useTransition();

  // Dados novos do servidor substituem o estado otimista.
  useEffect(() => setColumns(board.columns), [board.columns]);

  // Tempo real: o servidor avisa por SSE e a página busca o quadro de novo.
  useEffect(() => {
    const source = new EventSource(`/api/boards/${board.id}/events`);
    source.addEventListener("ready", () => setLive("online"));
    source.addEventListener("change", () => startTransition(() => router.refresh()));
    source.onerror = () => setLive("offline");
    source.onopen = () => setLive("online");
    return () => source.close();
  }, [board.id, router]);

  function report(result: actions.ActionResult<unknown>) {
    if (!result.ok) {
      setError(result.error);
      router.refresh();
    }
    return result.ok;
  }

  function move(cardId: string, toColumnId: string, toIndex: number) {
    const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
    const fromColumn = columns.find((c) => c.cards.some((card) => card.id === cardId));
    if (!card || !fromColumn) return;
    // O índice recebido conta o próprio cartão; o servidor espera a posição entre os demais.
    const currentIndex = fromColumn.cards.findIndex((c) => c.id === cardId);
    const index = fromColumn.id === toColumnId && toIndex > currentIndex ? toIndex - 1 : toIndex;
    if (fromColumn.id === toColumnId && index === currentIndex) return;

    setColumns((cols) => moveLocally(cols, cardId, toColumnId, index));
    const toColumn = columns.find((c) => c.id === toColumnId);
    setAnnouncement(`${card.title} movido para ${toColumn?.name}, posição ${index + 1}`);
    startTransition(async () => {
      report(await actions.moveCard({ cardId, toColumnId, toIndex: index }));
    });
  }

  function onCardKeyDown(e: React.KeyboardEvent, card: BoardCard, columnIndex: number, cardIndex: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenCardId(card.id);
      return;
    }
    if (!permissions.moveCard || !e.altKey) return;
    // Alt + setas move o cartão: ←/→ entre colunas, ↑/↓ dentro da coluna.
    const column = columns[columnIndex];
    let target: { columnId: string; index: number } | null = null;
    if (e.key === "ArrowLeft" && columnIndex > 0) target = { columnId: columns[columnIndex - 1].id, index: columns[columnIndex - 1].cards.length };
    if (e.key === "ArrowRight" && columnIndex < columns.length - 1) target = { columnId: columns[columnIndex + 1].id, index: columns[columnIndex + 1].cards.length };
    if (e.key === "ArrowUp" && cardIndex > 0) target = { columnId: column.id, index: cardIndex - 1 };
    if (e.key === "ArrowDown" && cardIndex < column.cards.length - 1) target = { columnId: column.id, index: cardIndex + 2 };
    if (!target) return;
    e.preventDefault();
    move(card.id, target.columnId, target.index);
    requestAnimationFrame(() => document.getElementById(`card-${card.id}`)?.focus());
  }

  function onDrop(e: React.DragEvent, columnId: string, index: number) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    setDragging(null);
    setDropTarget(null);
    if (cardId) move(cardId, columnId, index);
  }

  const openCard = openCardId ? columns.flatMap((c) => c.cards).find((c) => c.id === openCardId) : undefined;

  return (
    <main className="flex h-[calc(100vh-49px)] flex-col">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <h1 className="text-lg font-semibold">{board.name}</h1>
        <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span
            aria-hidden
            className={`size-2 rounded-full ${live === "online" ? "bg-green-500" : live === "offline" ? "bg-red-500" : "bg-amber-400"}`}
          />
          {live === "online" ? "Atualização em tempo real" : live === "offline" ? "Reconectando…" : "Conectando…"}
        </span>
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
          <button className="underline" onClick={() => setError(null)}>Fechar</button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {permissions.moveCard && (
        <p className="sr-only" id="board-help">
          Use Alt e as setas para mover o cartão focado entre colunas e posições. Enter abre o cartão.
        </p>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-4">
        {columns.map((column, columnIndex) => (
          <section
            key={column.id}
            aria-labelledby={`column-${column.id}`}
            className="flex w-72 shrink-0 flex-col rounded-lg bg-slate-200/60 dark:bg-slate-900"
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              // Os cartões tratam o próprio dragover; fora deles, o destino é o fim da coluna.
              setDropTarget({ columnId: column.id, index: column.cards.length });
            }}
            onDrop={(e) => onDrop(e, column.id, dropTarget?.columnId === column.id ? dropTarget.index : column.cards.length)}
          >
            <ColumnHeader column={column} canManage={permissions.manageColumns} onResult={report} index={columnIndex} total={columns.length} />

            <ol className="flex min-h-8 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {column.cards.map((card, cardIndex) => (
                <li
                  key={card.id}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const after = e.clientY > rect.top + rect.height / 2;
                    setDropTarget({ columnId: column.id, index: cardIndex + (after ? 1 : 0) });
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    onDrop(e, column.id, dropTarget?.columnId === column.id ? dropTarget.index : cardIndex);
                  }}
                >
                  {dropTarget?.columnId === column.id && dropTarget.index === cardIndex && <DropIndicator />}
                  <div
                    id={`card-${card.id}`}
                    role="button"
                    tabIndex={0}
                    aria-describedby={permissions.moveCard ? "board-help" : undefined}
                    draggable={permissions.moveCard}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(card.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onClick={() => setOpenCardId(card.id)}
                    onKeyDown={(e) => onCardKeyDown(e, card, columnIndex, cardIndex)}
                    className={`cursor-pointer rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm hover:border-sky-400 dark:border-slate-700 dark:bg-slate-800 ${dragging === card.id ? "opacity-40" : ""}`}
                  >
                    <CardSummary card={card} />
                  </div>
                  {dropTarget?.columnId === column.id && dropTarget.index === cardIndex + 1 && cardIndex === column.cards.length - 1 && <DropIndicator />}
                </li>
              ))}
              {column.cards.length === 0 && dropTarget?.columnId === column.id && <DropIndicator />}
            </ol>

            {permissions.createCard && <NewCardForm boardId={board.id} columnId={column.id} onResult={report} />}
          </section>
        ))}

        {permissions.manageColumns && <NewColumnForm boardId={board.id} onResult={report} />}
      </div>

      {openCard && (
        <CardDialog
          key={openCard.id}
          card={openCard}
          columns={columns.map((c) => ({ id: c.id, name: c.name }))}
          members={members}
          labels={labels}
          permissions={permissions}
          onClose={() => setOpenCardId(null)}
          onMove={(toColumnId) => move(openCard.id, toColumnId, columns.find((c) => c.id === toColumnId)?.cards.length ?? 0)}
          onResult={report}
        />
      )}
    </main>
  );
}

const PRIORITY_NAMES = { LOW: "baixa", MEDIUM: "média", HIGH: "alta", URGENT: "urgente" } as const;
const PRIORITY_STYLE = {
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  MEDIUM: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  HIGH: "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  URGENT: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
} as const;

function DropIndicator() {
  return <div aria-hidden className="my-1 h-1 rounded bg-sky-500" />;
}

function CardSummary({ card }: { card: BoardCard }) {
  const done = card.checklist.filter((i) => i.done).length;
  const overdue = card.dueDate && new Date(card.dueDate) < new Date();
  return (
    <>
      {card.labels.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span key={l.id} className={`rounded px-1.5 text-xs ${LABEL_COLORS[l.color] ?? LABEL_COLORS.slate}`}>{l.name}</span>
          ))}
        </div>
      )}
      <p className="font-medium">{card.title}</p>
      {card.ticket && (
        <p className="mt-1 flex flex-wrap gap-1 text-xs">
          <span className={`rounded px-1.5 ${PRIORITY_STYLE[card.ticket.priority]}`}>Chamado · {PRIORITY_NAMES[card.ticket.priority]}</span>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {card.dueDate && (
          <span className={overdue ? "font-medium text-red-700 dark:text-red-400" : ""}>
            {overdue ? "Atrasado · " : "Prazo · "}
            {new Date(card.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </span>
        )}
        {card.checklist.length > 0 && <span>Checklist {done}/{card.checklist.length}</span>}
        {card.assignee && <span>{card.assignee.name}</span>}
      </div>
    </>
  );
}

function ColumnHeader({
  column, canManage, onResult, index, total,
}: {
  column: Column;
  canManage: boolean;
  onResult: (r: actions.ActionResult<unknown>) => boolean;
  index: number;
  total: number;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="flex gap-1 p-2"
        action={(fd) =>
          startTransition(async () => {
            if (onResult(await actions.renameColumn({ columnId: column.id, name: String(fd.get("name")) }))) setEditing(false);
          })
        }
      >
        <label className="sr-only" htmlFor={`rename-${column.id}`}>Nome da coluna</label>
        <input id={`rename-${column.id}`} name="name" defaultValue={column.name} autoFocus className="input py-1" />
        <button className="btn" disabled={pending}>Salvar</button>
        <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-1 px-3 py-2">
      <h2 id={`column-${column.id}`} className="text-sm font-semibold">
        {column.name} <span className="font-normal text-slate-500 dark:text-slate-400">{column.cards.length}</span>
      </h2>
      {canManage && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded px-1 text-slate-600 hover:bg-slate-300 dark:text-slate-400 dark:hover:bg-slate-800" aria-label={`Opções da coluna ${column.name}`}>
            ⋯
          </summary>
          <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <button className="rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setEditing(true)}>Renomear</button>
            <button
              className="rounded px-2 py-1 text-left hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              disabled={index === 0 || pending}
              onClick={() => startTransition(async () => { onResult(await actions.moveColumn({ columnId: column.id, toIndex: index - 1 })); })}
            >
              Mover para a esquerda
            </button>
            <button
              className="rounded px-2 py-1 text-left hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
              disabled={index === total - 1 || pending}
              onClick={() => startTransition(async () => { onResult(await actions.moveColumn({ columnId: column.id, toIndex: index + 1 })); })}
            >
              Mover para a direita
            </button>
            <label className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400">
              Status do chamado ao entrar
              <select
                className="input mt-1 py-1 text-sm"
                value={column.ticketStatus ?? ""}
                disabled={pending}
                onChange={(e) =>
                  startTransition(async () => {
                    onResult(await actions.setColumnTicketStatus({ columnId: column.id, ticketStatus: e.target.value || null }));
                  })
                }
              >
                <option value="">Não altera</option>
                <option value="OPEN">Aberto</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="WAITING">Aguardando solicitante</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Encerrado</option>
              </select>
            </label>
            <button
              className="rounded px-2 py-1 text-left text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950"
              disabled={pending}
              onClick={() => {
                if (confirm(`Excluir a coluna "${column.name}"?`)) {
                  startTransition(async () => { onResult(await actions.deleteColumn({ columnId: column.id })); });
                }
              }}
            >
              Excluir
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

function NewCardForm({ boardId, columnId, onResult }: { boardId: string; columnId: string; onResult: (r: actions.ActionResult<unknown>) => boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="m-2 rounded-md px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-300/60 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setOpen(true)}>
        + Adicionar cartão
      </button>
    );
  }
  return (
    <form
      ref={formRef}
      className="space-y-2 p-2"
      action={(fd) =>
        startTransition(async () => {
          if (onResult(await actions.createCard({ boardId, columnId, title: String(fd.get("title")) }))) formRef.current?.reset();
        })
      }
    >
      <label className="sr-only" htmlFor={`new-card-${columnId}`}>Título do cartão</label>
      <textarea
        id={`new-card-${columnId}`}
        name="title"
        required
        autoFocus
        rows={2}
        className="input"
        placeholder="Título do cartão"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <div className="flex gap-2">
        <button className="btn-primary py-1.5" disabled={pending}>Adicionar</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function NewColumnForm({ boardId, onResult }: { boardId: string; onResult: (r: actions.ActionResult<unknown>) => boolean }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="flex h-fit w-72 shrink-0 gap-2 rounded-lg bg-slate-200/40 p-2 dark:bg-slate-900/60"
      action={(fd) =>
        startTransition(async () => {
          if (onResult(await actions.createColumn({ boardId, name: String(fd.get("name")) }))) formRef.current?.reset();
        })
      }
    >
      <label className="sr-only" htmlFor="new-column">Nova coluna</label>
      <input id="new-column" name="name" required placeholder="Nova coluna" className="input py-1" />
      <button className="btn" disabled={pending}>Criar</button>
    </form>
  );
}
