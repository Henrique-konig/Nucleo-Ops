"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s?: string) => {
  const [y, m, d] = (s ?? "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
};

/**
 * Campo de data com calendário próprio (o seletor nativo não segue o tema).
 * Envia AAAA-MM-DD no `name`, como o <input type="date">. O calendário abre como
 * popover nativo (camada superior, fecha com Esc ou clique fora) e anda pelo teclado:
 * setas, PageUp/PageDown (mês), Home/End (semana) e Enter.
 */
export function DatePicker({ name, defaultValue, label, className = "" }: { name: string; defaultValue?: string; label: string; className?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => fromIso(defaultValue) ?? new Date());
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const selected = fromIso(value);
  const id = useId();

  useEffect(() => {
    const el = pop.current!;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8));
      const below = r.bottom + 6;
      el.style.left = `${left}px`;
      el.style.top = `${below + el.offsetHeight > innerHeight - 8 && r.top > el.offsetHeight + 14 ? r.top - el.offsetHeight - 6 : below}px`;
    };
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) {
        setCursor(fromIso(value) ?? new Date());
        focusDay.current = true;
        requestAnimationFrame(place);
        addEventListener("scroll", place, true);
        addEventListener("resize", place);
      } else {
        removeEventListener("scroll", place, true);
        removeEventListener("resize", place);
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => {
      el.removeEventListener("toggle", onToggle);
      removeEventListener("scroll", place, true);
      removeEventListener("resize", place);
    };
  }, [value]);

  useEffect(() => {
    if (!open || !focusDay.current) return;
    focusDay.current = false;
    pop.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(cursor)}"]`)?.focus();
  }, [open, cursor]);

  function pick(d: Date | null) {
    setValue(d ? toIso(d) : "");
    pop.current?.hidePopover();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1),
      PageDown: () => addMonths(cursor, 1),
      Home: () => addDays(cursor, -cursor.getDay()),
      End: () => addDays(cursor, 6 - cursor.getDay()),
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    focusDay.current = true;
    setCursor(moves[e.key]());
  }

  const today = toIso(new Date());
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - first.getDay()));

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-label={`${label}: ${selected ? selected.toLocaleDateString("pt-BR", { dateStyle: "long" }) : "nenhuma data"}`}
        className={`input flex items-center gap-2 text-left ${className}`}
      >
        <CalendarDays className="size-4 shrink-0 text-slate-400" aria-hidden />
        <span className={`flex-1 tabular-nums ${selected ? "" : "text-slate-500 dark:text-slate-400"}`}>
          {selected ? selected.toLocaleDateString("pt-BR") : "dd/mm/aaaa"}
        </span>
      </button>
      <div
        ref={pop}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={`Escolher ${label.toLowerCase()}`}
        className="inset-auto m-0 w-72 animate-pop rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 shadow-lift dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {open && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => setCursor(addMonths(cursor, -1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <p className="font-semibold first-letter:uppercase" aria-live="polite">
                {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </p>
              <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => setCursor(addMonths(cursor, 1))}>
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center" onKeyDown={onKeyDown}>
              {WEEKDAYS.map((w) => (
                <abbr key={w} title={w} className="pb-1 text-[11px] font-medium text-slate-500 no-underline dark:text-slate-400">{w[0]}</abbr>
              ))}
              {days.map((d) => {
                const iso = toIso(d);
                const isCursor = iso === toIso(cursor);
                const isSelected = iso === value;
                const outside = d.getMonth() !== cursor.getMonth();
                return (
                  <button
                    key={iso}
                    type="button"
                    data-day={iso}
                    tabIndex={isCursor ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-current={iso === today ? "date" : undefined}
                    aria-label={d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    onClick={() => pick(d)}
                    className={`grid h-8 place-items-center rounded-lg tabular-nums transition-colors ${
                      isSelected
                        ? "bg-brand-600 font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
                        : `hover:bg-slate-100 dark:hover:bg-slate-800 ${outside ? "text-slate-400 dark:text-slate-600" : ""} ${iso === today ? "font-semibold text-brand-700 ring-1 ring-brand-300 ring-inset dark:text-brand-300 dark:ring-brand-800" : ""}`
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => pick(null)}>Limpar</button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs text-brand-700 dark:text-brand-300" onClick={() => pick(new Date())}>Hoje</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
