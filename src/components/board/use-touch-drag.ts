"use client";

import { useEffect, useRef, type RefObject } from "react";

export type DropTarget = { columnId: string; index: number };

type Options = {
  /** Contêiner com rolagem horizontal; cartões têm data-card-id e colunas data-column-id. */
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onStart: (cardId: string) => void;
  onOver: (target: DropTarget | null) => void;
  onDrop: (cardId: string, target: DropTarget | null) => void;
  onCancel: () => void;
};

const LONG_PRESS_MS = 350;
const MOVE_TOLERANCE = 8;
const EDGE = 48;

/** Onde o dedo está: coluna e posição entre os cartões (contando o próprio cartão arrastado). */
export function dropTargetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  const column = el?.closest<HTMLElement>("[data-column-id]");
  if (!column) return null;
  const columnId = column.dataset.columnId!;
  const cards = Array.from(column.querySelectorAll<HTMLElement>("[data-card-id]"));
  const index = cards.findIndex((card) => {
    const rect = card.getBoundingClientRect();
    return y < rect.top + rect.height / 2;
  });
  return { columnId, index: index === -1 ? cards.length : index };
}

/**
 * Arrastar e soltar por toque: segurar o cartão por um instante inicia o arraste;
 * mover o dedo antes disso rola o quadro normalmente. Perto das bordas, o quadro
 * rola sozinho para alcançar as outras colunas.
 */
export function useTouchDrag({ containerRef, enabled, onStart, onOver, onDrop, onCancel }: Options) {
  const handlers = useRef({ onStart, onOver, onDrop, onCancel });
  handlers.current = { onStart, onOver, onDrop, onCancel };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cardId: string | null = null;
    let active = false;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let ghost: HTMLElement | null = null;
    let offset = { x: 0, y: 0 };
    let frame = 0;
    let target: DropTarget | null = null;
    let suppressClick = false;

    function cleanup() {
      clearTimeout(timer);
      if (active && container) container.style.scrollSnapType = "";
      cancelAnimationFrame(frame);
      ghost?.remove();
      ghost = null;
      cardId = null;
      active = false;
      target = null;
    }

    function update() {
      if (!ghost) return;
      ghost.style.transform = `translate(${last.x - offset.x}px, ${last.y - offset.y}px) rotate(2deg)`;
      target = dropTargetAt(last.x, last.y);
      handlers.current.onOver(target);
    }

    // Rola o quadro enquanto o dedo estiver perto da borda.
    function autoScroll() {
      if (!active || !container) return;
      const rect = container.getBoundingClientRect();
      const speed = last.x < rect.left + EDGE ? -10 : last.x > rect.right - EDGE ? 10 : 0;
      if (speed) {
        container.scrollLeft += speed;
        update();
      }
      frame = requestAnimationFrame(autoScroll);
    }

    function begin(card: HTMLElement) {
      active = true;
      // O encaixe das colunas brigaria com a rolagem automática durante o arraste.
      container!.style.scrollSnapType = "none";
      suppressClick = true;
      navigator.vibrate?.(20);
      const rect = card.getBoundingClientRect();
      offset = { x: start.x - rect.left, y: start.y - rect.top };
      ghost = card.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("id");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: `${rect.width}px`,
        pointerEvents: "none",
        zIndex: "60",
        opacity: "0.95",
        boxShadow: "0 18px 40px -10px rgb(16 18 27 / 0.45)",
      });
      document.body.appendChild(ghost);
      handlers.current.onStart(cardId!);
      update();
      frame = requestAnimationFrame(autoScroll);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return cleanup();
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-card-id]");
      if (!card || card.dataset.pending) return;
      cardId = card.dataset.cardId!;
      start = last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timer = setTimeout(() => begin(card), LONG_PRESS_MS);
    }

    function onTouchMove(e: TouchEvent) {
      if (!cardId) return;
      const t = e.touches[0];
      last = { x: t.clientX, y: t.clientY };
      if (!active) {
        // Mexeu antes do toque longo: é rolagem, não arraste.
        if (Math.hypot(last.x - start.x, last.y - start.y) > MOVE_TOLERANCE) cleanup();
        return;
      }
      e.preventDefault();
      update();
    }

    function onTouchEnd() {
      if (active && cardId) {
        handlers.current.onDrop(cardId, target);
      } else if (cardId) {
        clearTimeout(timer);
      }
      cleanup();
    }

    function onTouchCancel() {
      if (active) handlers.current.onCancel();
      cleanup();
    }

    // O toque longo abriria o menu do sistema e o soltar viraria um clique no cartão.
    function onContextMenu(e: Event) {
      if ((e.target as HTMLElement).closest("[data-card-id]")) e.preventDefault();
    }
    function onClickCapture(e: MouseEvent) {
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }
    function onTouchStartReset() {
      suppressClick = false;
    }

    container.addEventListener("touchstart", onTouchStartReset, { passive: true, capture: true });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchCancel);
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("click", onClickCapture, true);
    return () => {
      cleanup();
      container.removeEventListener("touchstart", onTouchStartReset, { capture: true });
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchCancel);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("click", onClickCapture, true);
    };
  }, [containerRef, enabled]);
}
