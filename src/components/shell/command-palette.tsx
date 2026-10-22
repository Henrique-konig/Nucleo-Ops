"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BookOpen, Bot, CornerDownLeft, KanbanSquare, Loader2, Plus, Search, SquareStack, Ticket, type LucideIcon,
} from "lucide-react";
import type { SearchHit } from "@/lib/search";
import { normalize } from "@/lib/ai/text";

// Paleta de comandos: Ctrl+K (ou ⌘K) em qualquer tela abre a busca global.
// Também abre pelo evento "plantao:command-palette" (botão de busca da barra lateral).

export const OPEN_PALETTE_EVENT = "plantao:command-palette";

type Command = { id: string; title: string; subtitle: string; href: string; group: string; Icon: LucideIcon };

const HIT_GROUPS: Record<SearchHit["type"], { group: string; Icon: LucideIcon }> = {
  card: { group: "Cartões", Icon: SquareStack },
  ticket: { group: "Chamados", Icon: Ticket },
  board: { group: "Quadros", Icon: KanbanSquare },
  document: { group: "Base de conhecimento", Icon: BookOpen },
  agent: { group: "Agentes", Icon: Bot },
};

type Props = {
  pages: { href: string; label: string }[];
  actions: { href: string; label: string }[];
};

export function CommandPalette({ pages, actions }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Busca no servidor com espera curta, cancelando a anterior.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setHits(((await res.json()) as { hits: SearchHit[] }).hits);
        setFailed(false);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const commands = useMemo(() => {
    const q = normalize(query.trim());
    const local: Command[] = [
      ...actions.map((a) => ({ id: `action:${a.href}`, title: a.label, subtitle: "Ação", href: a.href, group: "Ações", Icon: Plus })),
      ...pages.map((p) => ({ id: `page:${p.href}`, title: p.label, subtitle: "Ir para", href: p.href, group: "Páginas", Icon: ArrowRight })),
    ].filter((c) => !q || normalize(c.title).includes(q));
    const remote: Command[] = hits.map((h) => ({ id: `${h.type}:${h.id}`, title: h.title, subtitle: h.subtitle, href: h.href, ...HIT_GROUPS[h.type] }));
    // Com texto digitado, os resultados da busca vêm primeiro.
    return q ? [...remote, ...local.slice(0, 5)] : local;
  }, [query, hits, pages, actions]);

  useEffect(() => setActive(0), [query, hits]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function go(command: Command | undefined) {
    if (!command) return;
    close();
    router.push(command.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(commands[active]);
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let lastGroup = "";
  return (
    <dialog
      ref={dialogRef}
      aria-label="Busca global"
      onClose={close}
      onClick={(e) => e.target === dialogRef.current && close()}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
        {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" aria-hidden /> : <Search className="size-4 shrink-0 text-slate-400" aria-hidden />}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={commands[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          placeholder="Buscar cartões, chamados, quadros, documentos, agentes…"
          className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
        />
        <kbd className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 sm:block dark:border-slate-700">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" aria-label="Resultados" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
        {commands.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {header && <p className="eyebrow px-2.5 pt-2 pb-1" aria-hidden>{header}</p>}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(c)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${
                  i === active ? "bg-brand-50 text-brand-900 dark:bg-brand-950/60 dark:text-brand-100" : "text-slate-700 dark:text-slate-300"
                }`}
              >
                <c.Icon className={`size-4 shrink-0 ${i === active ? "text-brand-600 dark:text-brand-300" : "text-slate-400"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{c.subtitle}</span>
                </span>
                {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-slate-400" aria-hidden />}
              </div>
            </li>
          );
        })}
        {commands.length === 0 && (
          <li className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {failed ? "Não foi possível buscar agora. Tente de novo em instantes." : loading ? "Buscando…" : `Nada encontrado para "${query}".`}
          </li>
        )}
      </ul>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span><kbd className="font-sans">↑ ↓</kbd> navegar</span>
        <span><kbd className="font-sans">Enter</kbd> abrir</span>
        <span>Código do chamado: <kbd className="font-sans">#a1b2c3d4</kbd></span>
      </p>
    </dialog>
  );
}
