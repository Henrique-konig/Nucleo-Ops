"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, CalendarClock, Check, CheckSquare, ChevronDown, GripVertical, LayoutGrid, Loader2, MessageSquare, MoreHorizontal, Paperclip, Plus, Radio, Ticket, X } from "lucide-react";
import type { BoardCard, BoardData, SavedFilterItem } from "@/lib/boards";
import * as actions from "@/app/(app)/boards/[boardId]/actions";
import { CardDialog } from "./card-dialog";
import { FilterBar } from "./filter-bar";
import { initials } from "@/lib/initials";
import { isFilterActive, matchesFilter, type BoardFilter } from "@/lib/board-filters";
import { accent } from "@/components/ui/accent";
import { COLUMN_ACCENTS, LABEL_COLORS, type AgentOption, type BoardOption, type LabelOption, type MemberOption } from "./shared";
import { useTouchDrag, type DropTarget } from "./use-touch-drag";

export type BoardPermissions = {
  createCard: boolean;
  editCard: boolean;
  moveCard: boolean;
  assign: boolean;
  manageColumns: boolean;
  runAgents: boolean;
  comment: boolean;
};

type Column = BoardData["columns"][number];

type Props = {
  board: BoardData;
  boards: BoardOption[];
  members: MemberOption[];
  labels: LabelOption[];
  agents: AgentOption[];
  savedFilters: SavedFilterItem[];
  userId: string;
  initialCardId: string | null;
  permissions: BoardPermissions;
};

/** Cartões renderizados por coluna antes do botão "Mostrar mais", para colunas longas não travarem a página. */
const CARDS_PER_PAGE = 40;

/** Cartão provisório, mostrado enquanto o servidor cria o de verdade. */
function pendingCard(columnId: string, title: string): BoardCard {
  return {
    id: `pending-${crypto.randomUUID()}`, title, columnId, description: null, dueDate: null,
    assignee: null, agent: null, labels: [], checklist: [], ticket: null, links: [], _count: { comments: 0, attachments: 0 },
  } as unknown as BoardCard;
}

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

export function BoardView({ board, boards, members, labels, agents, savedFilters, userId, initialCardId, permissions }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState(board.columns);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(initialCardId);
  const [filter, setFilter] = useState<BoardFilter>({});
  const [saved, setSaved] = useState(savedFilters);
  const [version, setVersion] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [shown, setShown] = useState<Record<string, number>>({});
  const [activeColumn, setActiveColumn] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<"connecting" | "online" | "offline">("connecting");
  const [, startTransition] = useTransition();

  // Link de notificação para outro cartão do mesmo quadro: a página não remonta.
  useEffect(() => {
    if (initialCardId) setOpenCardId(initialCardId);
  }, [initialCardId]);

  // Dados novos do servidor substituem o estado otimista.
  useEffect(() => setColumns(board.columns), [board.columns]);
  useEffect(() => setSaved(savedFilters), [savedFilters]);

  // Com filtro, cada coluna mostra só os cartões que atendem; o arraste continua
  // valendo e as posições são convertidas para a lista completa.
  const filtering = isFilterActive(filter);
  const visibleColumns = useMemo(
    () => (filtering ? columns.map((col) => ({ ...col, cards: col.cards.filter((card) => matchesFilter(card, filter, { userId })) })) : columns),
    [columns, filter, filtering, userId],
  );

  function realIndex(columnId: string, visibleIndex: number) {
    const full = columns.find((c) => c.id === columnId);
    const visible = visibleColumns.find((c) => c.id === columnId);
    if (!full || !visible || !filtering) return visibleIndex;
    const anchor = visible.cards[visibleIndex];
    return anchor ? full.cards.findIndex((c) => c.id === anchor.id) : full.cards.length;
  }

  // Tempo real: o servidor avisa por SSE e a página busca o quadro de novo.
  useEffect(() => {
    const source = new EventSource(`/api/boards/${board.id}/events`);
    source.addEventListener("ready", () => setLive("online"));
    source.addEventListener("change", () => {
      setVersion((v) => v + 1);
      startTransition(() => router.refresh());
    });
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

  // Criação otimista: o cartão aparece na hora e some se o servidor recusar.
  async function createCard(columnId: string, title: string) {
    const temp = pendingCard(columnId, title.trim());
    setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, temp] } : c)));
    const result = await actions.createCard({ boardId: board.id, columnId, title });
    if (!result.ok) setColumns((cols) => cols.map((c) => ({ ...c, cards: c.cards.filter((card) => card.id !== temp.id) })));
    return report(result);
  }

  useTouchDrag({
    containerRef: scrollerRef,
    enabled: permissions.moveCard,
    onStart: setDragging,
    onOver: setDropTarget,
    onDrop: (cardId, target) => {
      setDragging(null);
      setDropTarget(null);
      if (target) move(cardId, target.columnId, realIndex(target.columnId, target.index));
    },
    onCancel: () => {
      setDragging(null);
      setDropTarget(null);
    },
  });

  // No celular cada coluna ocupa quase a tela; os marcadores mostram em qual delas a pessoa está.
  function onScroll() {
    const el = scrollerRef.current;
    const first = el?.querySelector<HTMLElement>("[data-column-id]");
    if (!el || !first) return;
    setActiveColumn(Math.round(el.scrollLeft / (first.offsetWidth + 16)));
  }
  function scrollToColumn(index: number) {
    const el = scrollerRef.current?.querySelectorAll<HTMLElement>("[data-column-id]")[index];
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  function onCardKeyDown(e: React.KeyboardEvent, card: BoardCard, columnIndex: number, cardIndex: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpenCardId(card.id);
      return;
    }
    if (!permissions.moveCard || !e.altKey) return;
    // Alt + setas move o cartão: ←/→ entre colunas, ↑/↓ dentro da coluna.
    const cols = visibleColumns;
    const column = cols[columnIndex];
    let target: { columnId: string; index: number } | null = null;
    if (e.key === "ArrowLeft" && columnIndex > 0) target = { columnId: cols[columnIndex - 1].id, index: cols[columnIndex - 1].cards.length };
    if (e.key === "ArrowRight" && columnIndex < cols.length - 1) target = { columnId: cols[columnIndex + 1].id, index: cols[columnIndex + 1].cards.length };
    if (e.key === "ArrowUp" && cardIndex > 0) target = { columnId: column.id, index: cardIndex - 1 };
    if (e.key === "ArrowDown" && cardIndex < column.cards.length - 1) target = { columnId: column.id, index: cardIndex + 2 };
    if (!target) return;
    e.preventDefault();
    move(card.id, target.columnId, realIndex(target.columnId, target.index));
    requestAnimationFrame(() => document.getElementById(`card-${card.id}`)?.focus());
  }

  // Toque (celular): segurar o cartão por um instante inicia o arraste; mover o
  // dedo antes disso rola o quadro normalmente.
  const touch = useRef<{ cardId: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; active: boolean } | null>(null);
  const dropRef = useRef(dropTarget);
  dropRef.current = dropTarget;
  const boardRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [touchDragging, setTouchDragging] = useState(false);
  const moveRef = useRef(move);
  moveRef.current = (cardId: string, columnId: string, index: number) => move(cardId, columnId, realIndex(columnId, index));

  function onCardTouchStart(e: React.TouchEvent, cardId: string) {
    if (!permissions.moveCard || e.touches.length !== 1) return;
    const t = e.touches[0];
    const state = { cardId, x: t.clientX, y: t.clientY, timer: null as ReturnType<typeof setTimeout> | null, active: false };
    state.timer = setTimeout(() => {
      state.active = true;
      setDragging(cardId);
      setTouchDragging(true);
      navigator.vibrate?.(15);
    }, 350);
    touch.current = state;
  }

  function onCardTouchMove(e: React.TouchEvent) {
    const state = touch.current;
    if (!state || state.active) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - state.x, t.clientY - state.y) > 10) {
      if (state.timer) clearTimeout(state.timer);
      touch.current = null;
    }
  }

  function onCardTouchEnd() {
    const state = touch.current;
    if (state && !state.active) {
      if (state.timer) clearTimeout(state.timer);
      touch.current = null;
    }
  }

  useEffect(() => {
    if (!touchDragging) return;
    function target(x: number, y: number) {
      const el = document.elementFromPoint(x, y);
      const section = el?.closest<HTMLElement>("[data-drop-column]");
      if (!section) return null;
      const columnId = section.dataset.dropColumn!;
      const item = el?.closest<HTMLElement>("[data-drop-index]");
      if (!item) return { columnId, index: Number(section.dataset.dropCount ?? 0) };
      const rect = item.getBoundingClientRect();
      return { columnId, index: Number(item.dataset.dropIndex) + (y > rect.top + rect.height / 2 ? 1 : 0) };
    }
    function onMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      setDropTarget(target(t.clientX, t.clientY));
      // Perto da borda, o quadro rola sozinho para alcançar outras colunas.
      const board = boardRef.current;
      if (board) {
        if (t.clientX < 48) board.scrollBy({ left: -16 });
        else if (t.clientX > window.innerWidth - 48) board.scrollBy({ left: 16 });
      }
    }
    function onEnd() {
      const state = touch.current;
      const drop = dropRef.current;
      touch.current = null;
      setTouchDragging(false);
      setDragging(null);
      setDropTarget(null);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 50);
      if (state && drop) moveRef.current(state.cardId, drop.columnId, drop.index);
    }
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [touchDragging]);

  function onDrop(e: React.DragEvent, columnId: string, index: number) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    setDragging(null);
    setDropTarget(null);
    if (cardId) move(cardId, columnId, realIndex(columnId, index));
  }

  const totalCards = columns.reduce((n, c) => n + c.cards.length, 0);
  const visibleCards = visibleColumns.reduce((n, c) => n + c.cards.length, 0);
  const openCard = openCardId ? columns.flatMap((c) => c.cards).find((c) => c.id === openCardId) : undefined;

  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-6 pb-5 sm:px-6 lg:px-8 lg:pt-8">
        {/* z-30: o menu de troca de quadro passa por cima da barra de filtros. */}
        <div className="relative z-30 min-w-0 animate-rise">
          <p className="eyebrow">Quadro</p>
          <BoardSwitcher board={board} boards={boards} />
          <p className="page-subtitle">
            {board.description ? `${board.description} · ` : ""}
            {totalCards === 0 ? "Nenhum cartão ainda" : `${totalCards} ${totalCards === 1 ? "cartão" : "cartões"} em ${columns.length} colunas`}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            live === "online"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              : live === "offline"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          <span className="relative flex size-2" aria-hidden>
            {live === "online" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex size-2 rounded-full ${live === "online" ? "bg-emerald-500" : live === "offline" ? "bg-red-500" : "bg-amber-400"}`} />
          </span>
          <Radio className="size-3.5" aria-hidden />
          {live === "online" ? "Tempo real" : live === "offline" ? "Reconectando…" : "Conectando…"}
        </span>
      </div>

      <FilterBar
        boardId={board.id}
        filter={filter}
        onChange={setFilter}
        saved={saved}
        onSavedChange={setSaved}
        members={members}
        labels={labels}
        agents={agents}
        canShare={permissions.manageColumns}
        visible={visibleCards}
        total={totalCards}
        onResult={report}
      />

      {error && (
        <div role="alert" className="alert-error mx-4 mb-3 animate-rise sm:mx-6 lg:mx-8">
          {error}
          <button className="icon-btn size-6" aria-label="Fechar aviso" onClick={() => setError(null)}><X className="size-4" aria-hidden /></button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {permissions.moveCard && (
        <p className="sr-only" id="board-help">
          Use Alt e as setas para mover o cartão focado entre colunas e posições. Enter abre o cartão. No celular, segure o cartão para arrastar.
        </p>
      )}

      {visibleColumns.length > 1 && (
        <nav aria-label="Colunas" className="-mt-2 mb-3 flex gap-1.5 overflow-x-auto px-4 sm:hidden">
          {visibleColumns.map((column, i) => (
            <button
              key={column.id}
              type="button"
              aria-current={i === activeColumn ? "true" : undefined}
              onClick={() => scrollToColumn(i)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                i === activeColumn
                  ? "bg-brand-600 text-white dark:bg-brand-500"
                  : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {column.name} <span className="tabular-nums opacity-75">{column.cards.length}</span>
            </button>
          ))}
        </nav>
      )}

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-6 sm:snap-proximity sm:scroll-px-6 sm:px-6 lg:px-8"
      >
        {visibleColumns.map((column, columnIndex) => (
          <section
            key={column.id}
            data-column-id={column.id}
            aria-labelledby={`column-${column.id}`}
            data-drop-column={column.id}
            data-drop-count={column.cards.length}
            style={{ animationDelay: `${columnIndex * 50}ms` }}
            className={`flex w-[85vw] max-w-[19rem] shrink-0 animate-rise snap-start flex-col rounded-2xl border transition-colors duration-200 sm:w-[19rem] ${
              dragging && dropTarget?.columnId === column.id
                ? "border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30"
                : "border-slate-200/70 bg-slate-100/70 dark:border-slate-800/70 dark:bg-slate-900/40"
            }`}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              // Os cartões tratam o próprio dragover; fora deles, o destino é o fim da coluna.
              setDropTarget({ columnId: column.id, index: column.cards.length });
            }}
            onDrop={(e) => onDrop(e, column.id, dropTarget?.columnId === column.id ? dropTarget.index : column.cards.length)}
          >
            <ColumnHeader
              column={column}
              totalCards={filtering ? columns[columnIndex].cards.length : undefined}
              canManage={permissions.manageColumns}
              onResult={report}
              index={columnIndex}
              total={columns.length}
            />

            <ol className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pt-0.5 pb-2.5">
              {column.cards.slice(0, shown[column.id] ?? CARDS_PER_PAGE).map((card, cardIndex) => (
                <li
                  key={card.id}
                  data-drop-index={cardIndex}
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
                    data-card-id={card.id}
                    data-pending={card.id.startsWith("pending-") || undefined}
                    role="button"
                    tabIndex={card.id.startsWith("pending-") ? -1 : 0}
                    aria-disabled={card.id.startsWith("pending-") || undefined}
                    aria-describedby={permissions.moveCard ? "board-help" : undefined}
                    draggable={permissions.moveCard && !card.id.startsWith("pending-")}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(card.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onClick={() => !card.id.startsWith("pending-") && setOpenCardId(card.id)}
                    onKeyDown={(e) => !card.id.startsWith("pending-") && onCardKeyDown(e, card, columnIndex, cardIndex)}
                    className={`group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3 text-sm shadow-card transition duration-200 select-none [-webkit-touch-callout:none] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift active:cursor-grabbing dark:border-slate-700/60 dark:bg-slate-800/70 dark:hover:border-brand-700 ${
                      dragging === card.id ? "scale-[0.97] rotate-1 opacity-40" : ""
                    } ${card.id.startsWith("pending-") ? "pointer-events-none opacity-70" : ""}`}
                  >
                    <CardSummary card={card} draggable={permissions.moveCard} />
                    {card.id.startsWith("pending-") && (
                      <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Salvando…
                      </span>
                    )}
                  </div>
                  {dropTarget?.columnId === column.id && dropTarget.index === cardIndex + 1 && cardIndex === column.cards.length - 1 && <DropIndicator />}
                </li>
              ))}
              {column.cards.length > (shown[column.id] ?? CARDS_PER_PAGE) && (
                <li>
                  <button
                    type="button"
                    className="btn-ghost w-full text-xs"
                    onClick={() => setShown((v) => ({ ...v, [column.id]: (v[column.id] ?? CARDS_PER_PAGE) + CARDS_PER_PAGE }))}
                  >
                    <ChevronDown className="size-3.5" aria-hidden /> Mostrar mais {Math.min(CARDS_PER_PAGE, column.cards.length - (shown[column.id] ?? CARDS_PER_PAGE))} de {column.cards.length - (shown[column.id] ?? CARDS_PER_PAGE)} restantes
                  </button>
                </li>
              )}
              {column.cards.length === 0 && dropTarget?.columnId === column.id && <DropIndicator />}
              {column.cards.length === 0 && dropTarget?.columnId !== column.id && (
                <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/80 px-3 py-8 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                  {filtering ? "Nenhum cartão neste filtro" : permissions.moveCard ? "Nenhum cartão aqui. Arraste um cartão para esta coluna." : "Nenhum cartão nesta coluna"}
                </li>
              )}
            </ol>

            {permissions.createCard && <NewCardForm columnId={column.id} onCreate={createCard} />}
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
          agents={agents}
          boards={boards.filter((b) => b.id !== board.id)}
          permissions={permissions}
          currentUserId={userId}
          version={version}
          onClose={() => {
            setOpenCardId(null);
            // Tira o ?cartao= da URL, para recarregar a página sem reabrir o cartão.
            if (initialCardId) router.replace(`/boards/${board.id}`, { scroll: false });
          }}
          onMove={(toColumnId) => move(openCard.id, toColumnId, columns.find((c) => c.id === toColumnId)?.cards.length ?? 0)}
          onResult={report}
        />
      )}
    </main>
  );
}

const PRIORITY_NAMES = { LOW: "baixa", MEDIUM: "média", HIGH: "alta", URGENT: "urgente" } as const;
const PRIORITY_STYLE = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300",
  MEDIUM: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  HIGH: "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  URGENT: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
} as const;
const PRIORITY_BAR = { LOW: "bg-slate-300 dark:bg-slate-600", MEDIUM: "bg-sky-400", HIGH: "bg-orange-400", URGENT: "bg-red-500" } as const;

function DropIndicator() {
  return <div aria-hidden className="my-0.5 h-1 animate-fade-in rounded-full bg-brand-500 shadow-[0_0_12px_rgb(116_104_241/0.7)]" />;
}

function CardSummary({ card, draggable }: { card: BoardCard; draggable: boolean }) {
  const done = card.checklist.filter((i) => i.done).length;
  const overdue = card.dueDate && new Date(card.dueDate) < new Date();
  const hasMeta = card.dueDate || card.checklist.length > 0 || card.assignee || card.agent || card._count.comments > 0 || card._count.attachments > 0;
  return (
    <>
      {card.ticket && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_BAR[card.ticket.priority]}`} />}
      {draggable && (
        <GripVertical aria-hidden className="absolute top-3 right-2 size-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600" />
      )}
      {card.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span key={l.id} className={`badge text-[11px] ${LABEL_COLORS[l.color] ?? LABEL_COLORS.slate}`}>{l.name}</span>
          ))}
        </div>
      )}
      <p className="pr-4 leading-snug font-medium text-slate-800 dark:text-slate-100">{card.title}</p>
      {card.ticket && (
        <p className="mt-2 flex flex-wrap gap-1">
          <span className={`badge ${PRIORITY_STYLE[card.ticket.priority]}`}>
            <Ticket className="size-3" aria-hidden /> Chamado · {PRIORITY_NAMES[card.ticket.priority]}
          </span>
        </p>
      )}
      {hasMeta && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {card.dueDate && (
              <span className={`inline-flex items-center gap-1 ${overdue ? "rounded-md bg-red-50 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300" : ""}`}>
                <CalendarClock className="size-3.5" aria-hidden />
                <span className="sr-only">{overdue ? "Atrasado · " : "Prazo · "}</span>
                {new Date(card.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" })}
              </span>
            )}
            {card.checklist.length > 0 && (
              <span className={`inline-flex items-center gap-1 ${done === card.checklist.length ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                <CheckSquare className="size-3.5" aria-hidden />
                <span className="sr-only">Checklist </span>
                {done}/{card.checklist.length}
              </span>
            )}
            {card._count.comments > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3.5" aria-hidden />
                {card._count.comments}
                <span className="sr-only">{card._count.comments === 1 ? "comentário" : "comentários"}</span>
              </span>
            )}
            {card._count.attachments > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="size-3.5" aria-hidden />
                {card._count.attachments}
                <span className="sr-only">{card._count.attachments === 1 ? "anexo" : "anexos"}</span>
              </span>
            )}
          </div>
          <span className="flex shrink-0 items-center -space-x-1.5">
          {card.agent && (
            <span
              title={`Agente: ${card.agent.name}`}
              className={`grid size-6 shrink-0 place-items-center rounded-full ring-2 ring-white dark:ring-slate-800 ${accent(card.agent.color).soft}`}
            >
              <Bot className="size-3.5" aria-hidden />
              <span className="sr-only">Agente {card.agent.name}</span>
            </span>
          )}
          {card.assignee && (
            <span
              title={card.assignee.name}
              className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-800"
            >
              <span aria-hidden>{initials(card.assignee.name)}</span>
              <span className="sr-only">{card.assignee.name}</span>
            </span>
          )}
          </span>
        </div>
      )}
    </>
  );
}

function ColumnHeader({
  column, totalCards, canManage, onResult, index, total,
}: {
  column: Column;
  totalCards?: number;
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
        className="flex gap-1 p-2.5"
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
    <div className="flex items-center justify-between gap-1 px-3.5 pt-3 pb-2.5">
      <h2 id={`column-${column.id}`} className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <span aria-hidden className={`size-2 rounded-full ${COLUMN_ACCENTS[index % COLUMN_ACCENTS.length]}`} />
        {column.name}
        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-400">
          {totalCards === undefined ? column.cards.length : `${column.cards.length}/${totalCards}`}
        </span>
      </h2>
      {canManage && (
        <details className="relative">
          <summary className="icon-btn size-7 cursor-pointer" aria-label={`Opções da coluna ${column.name}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </summary>
          <div className="menu">
            <button className="menu-item" onClick={() => setEditing(true)}>Renomear</button>
            <button
              className="menu-item"
              disabled={index === 0 || pending}
              onClick={() => startTransition(async () => { onResult(await actions.moveColumn({ columnId: column.id, toIndex: index - 1 })); })}
            >
              Mover para a esquerda
            </button>
            <button
              className="menu-item"
              disabled={index === total - 1 || pending}
              onClick={() => startTransition(async () => { onResult(await actions.moveColumn({ columnId: column.id, toIndex: index + 1 })); })}
            >
              Mover para a direita
            </button>
            <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" aria-hidden />
            <label className="px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
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
            <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" aria-hidden />
            <button
              className="menu-item text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/60"
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

function NewCardForm({ columnId, onCreate }: { columnId: string; onCreate: (columnId: string, title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        className="mx-2.5 mb-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900 hover:shadow-card dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden /> Adicionar cartão
      </button>
    );
  }
  return (
    <form
      ref={formRef}
      className="animate-rise space-y-2 px-2.5 pb-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const title = String(new FormData(e.currentTarget).get("title") ?? "");
        if (!title.trim()) return;
        // O formulário limpa na hora para a próxima digitação; o cartão aparece como "Salvando…".
        formRef.current?.reset();
        void onCreate(columnId, title);
      }}
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
        <button className="btn-primary py-1.5">Adicionar</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
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
      className="flex h-fit w-[19rem] shrink-0 animate-rise flex-col gap-2 rounded-2xl border border-dashed border-slate-300 p-3 transition-colors focus-within:border-brand-400 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600"
      action={(fd) =>
        startTransition(async () => {
          if (onResult(await actions.createColumn({ boardId, name: String(fd.get("name")) }))) formRef.current?.reset();
        })
      }
    >
      <label className="sr-only" htmlFor="new-column">Nova coluna</label>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400"><Plus className="size-4" aria-hidden /> Nova coluna</p>
      <div className="flex gap-2">
        <input id="new-column" name="name" required placeholder="Nome da coluna" className="input py-1.5" />
        <button className="btn" disabled={pending}>Criar</button>
      </div>
    </form>
  );
}

/** Título do quadro com a troca rápida para os outros quadros da equipe. */
function BoardSwitcher({ board, boards }: { board: BoardData; boards: BoardOption[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative mt-1">
      <summary className="group flex cursor-pointer list-none items-center gap-2 rounded-lg [&::-webkit-details-marker]:hidden">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${accent(board.color).dot}`} />
        <h1 className="page-title truncate">{board.name}</h1>
        <ChevronDown className="size-5 shrink-0 text-slate-400 transition group-open:rotate-180 group-hover:text-slate-600" aria-hidden />
        <span className="sr-only">Trocar de quadro</span>
      </summary>
      <div className="menu right-auto left-0 w-72">
        <p className="eyebrow px-2.5 pt-1 pb-1.5">Quadros da equipe</p>
        <ul className="max-h-72 overflow-y-auto">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                href={`/boards/${b.id}`}
                aria-current={b.id === board.id ? "page" : undefined}
                onClick={() => ref.current?.removeAttribute("open")}
                className="menu-item flex items-center gap-2"
              >
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${accent(b.color).dot}`} />
                <span className="flex-1 truncate">{b.name}</span>
                {b.id === board.id && <Check className="size-4 text-brand-600" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
        <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" aria-hidden />
        <Link href="/boards" className="menu-item flex items-center gap-2"><LayoutGrid className="size-4" aria-hidden /> Todos os quadros</Link>
      </div>
    </details>
  );
}
