"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkPlus, Filter, Search, Users, X } from "lucide-react";
import { cleanFilter, isFilterActive, sameFilter, type BoardFilter } from "@/lib/board-filters";
import type { SavedFilterItem } from "@/lib/boards";
import * as actions from "@/app/(app)/boards/[boardId]/actions";
import type { AgentOption, LabelOption, MemberOption } from "./shared";

type Props = {
  boardId: string;
  filter: BoardFilter;
  onChange: (filter: BoardFilter) => void;
  saved: SavedFilterItem[];
  onSavedChange: (saved: SavedFilterItem[]) => void;
  members: MemberOption[];
  labels: LabelOption[];
  agents: AgentOption[];
  canShare: boolean;
  visible: number;
  total: number;
  onResult: (r: actions.ActionResult<unknown>) => boolean;
};

const PRIORITIES = [["URGENT", "Urgente"], ["HIGH", "Alta"], ["MEDIUM", "Média"], ["LOW", "Baixa"], ["NONE", "Sem chamado"]] as const;

/** Barra de filtros do quadro, com filtros salvos (pessoais ou da equipe). */
export function FilterBar({ boardId, filter, onChange, saved, onSavedChange, members, labels, agents, canShare, visible, total, onResult }: Props) {
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const active = isFilterActive(filter);
  const set = (patch: Partial<BoardFilter>) => onChange(cleanFilter({ ...filter, ...patch }));
  const current = saved.find((s) => sameFilter(s.filters, filter));

  return (
    <div className="space-y-2 px-4 pb-4 sm:px-6 lg:px-8" role="search" aria-label="Filtrar cartões">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar no quadro</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filter.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="Filtrar cartões"
            className="input py-1.5 pl-9"
          />
        </label>
        {/* No celular, os seletores rolam na horizontal em vez de ocupar várias linhas. */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
          <Select label="Responsável" value={filter.assigneeId} onChange={(v) => set({ assigneeId: v })}>
            <option value="me">Comigo</option>
            <option value="none">Sem responsável</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select label="Prioridade" value={filter.priority} onChange={(v) => set({ priority: v as BoardFilter["priority"] })}>
            {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          {labels.length > 0 && (
            <Select label="Etiqueta" value={filter.labelId} onChange={(v) => set({ labelId: v })}>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          )}
          {agents.length > 0 && (
            <Select label="Agente" value={filter.agentId} onChange={(v) => set({ agentId: v })}>
              <option value="any">Com agente</option>
              <option value="none">Sem agente</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
          <Select label="Prazo" value={filter.due} onChange={(v) => set({ due: v as BoardFilter["due"] })}>
            <option value="overdue">Atrasados</option>
            <option value="week">Próximos 7 dias</option>
            <option value="none">Sem prazo</option>
          </Select>
        </div>
        {active && (
          <>
            <button className="btn-ghost py-1.5" onClick={() => onChange({})}><X className="size-4" aria-hidden /> Limpar</button>
            {!current && <button className="btn py-1.5" onClick={() => setSaving(true)}><BookmarkPlus className="size-4" aria-hidden /> Salvar filtro</button>}
          </>
        )}
        {active && (
          <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400" aria-live="polite">
            {visible} de {total} {total === 1 ? "cartão" : "cartões"}
          </span>
        )}
      </div>

      {saving && (
        <form
          className="flex animate-rise flex-wrap items-center gap-2"
          action={(fd) =>
            startTransition(async () => {
              const result = await actions.saveFilter({ boardId, name: String(fd.get("name")), filters: filter, shared: fd.get("shared") === "on" });
              if (onResult(result) && result.ok) {
                onSavedChange([...saved, result.data]);
                setSaving(false);
              }
            })
          }
        >
          <label className="sr-only" htmlFor="filter-name">Nome do filtro</label>
          <input id="filter-name" name="name" required maxLength={40} autoFocus placeholder="Nome do filtro (ex.: Urgentes comigo)" className="input w-64 py-1.5" />
          {canShare && (
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="shared" /> Compartilhar com a equipe</label>
          )}
          <button className="btn-primary py-1.5" disabled={pending}>Salvar</button>
          <button type="button" className="btn-ghost py-1.5" onClick={() => setSaving(false)}>Cancelar</button>
        </form>
      )}

      {saved.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Filtros salvos">
          <li className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400"><Filter className="size-3.5" aria-hidden /> Salvos:</li>
          {saved.map((s) => {
            const on = current?.id === s.id;
            return (
              <li key={s.id} className={`group inline-flex items-center rounded-full border text-xs font-medium transition ${on ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-200" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                <button
                  className="inline-flex items-center gap-1 py-1 pr-1 pl-2.5"
                  aria-pressed={on}
                  title={s.shared ? `Compartilhado por ${s.mine ? "você" : s.owner}` : "Só você vê"}
                  onClick={() => onChange(on ? {} : s.filters)}
                >
                  {s.shared ? <Users className="size-3" aria-hidden /> : <Bookmark className="size-3" aria-hidden />}
                  {s.name}
                </button>
                {(s.mine || canShare) && (
                  <button
                    className="mr-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    aria-label={`Excluir o filtro ${s.name}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        if (onResult(await actions.deleteFilter({ filterId: s.id }))) onSavedChange(saved.filter((x) => x.id !== s.id));
                      })
                    }
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; children: React.ReactNode }) {
  return (
    <label className="relative shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={`input w-auto py-1.5 pr-8 text-sm ${value ? "border-brand-300 bg-brand-50/60 text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200" : ""}`}
      >
        <option value="">{label}</option>
        {children}
      </select>
    </label>
  );
}
