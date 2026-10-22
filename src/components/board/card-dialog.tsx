"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Archive, CheckSquare, ExternalLink, GitPullRequest, Tag, Trash2, X } from "lucide-react";
import type { BoardCard } from "@/lib/boards";
import * as actions from "@/app/(app)/boards/[boardId]/actions";
import type { BoardPermissions } from "./board-view";
import { LABEL_COLOR_NAMES, LABEL_COLORS, type LabelOption, type MemberOption } from "./shared";

type Props = {
  card: BoardCard;
  columns: { id: string; name: string }[];
  members: MemberOption[];
  labels: LabelOption[];
  permissions: BoardPermissions;
  onClose: () => void;
  onMove: (toColumnId: string) => void;
  onResult: (r: actions.ActionResult<unknown>) => boolean;
};

/** Data do prazo no formato do <input type="date"> (prazos são gravados à meia-noite UTC). */
function toDateInput(date: Date | string | null) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export function CardDialog({ card, columns, members, labels, permissions, onClose, onMove, onResult }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [labelOptions, setLabelOptions] = useState(labels);
  const readOnly = !permissions.editCard;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function save(fd: FormData) {
    const dueDate = String(fd.get("dueDate") ?? "");
    startTransition(async () => {
      const ok = onResult(
        await actions.updateCard({
          cardId: card.id,
          title: String(fd.get("title")),
          description: String(fd.get("description") ?? "") || null,
          dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null,
          labelIds: fd.getAll("labelIds").map(String),
          ...(permissions.assign && { assigneeId: String(fd.get("assigneeId") ?? "") || null }),
        }),
      );
      if (ok) onClose();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="card-dialog-title"
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div>
          <p className="eyebrow">{columns.find((c) => c.id === card.columnId)?.name ?? "Cartão"}</p>
          <h2 id="card-dialog-title" className="mt-0.5 text-lg font-semibold tracking-tight">Detalhes do cartão</h2>
          {card.ticket && (
            <a href={`/chamados/${card.ticket.id}`} className="link mt-1 inline-flex items-center gap-1 text-sm">
              Abrir chamado e conversa <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X className="size-5" aria-hidden /></button>
      </div>
      <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5">

        <form action={save} className="space-y-4">
          <fieldset disabled={readOnly || pending} className="space-y-4">
            <label className="block space-y-1">
              <span className="field-label">Título</span>
              <input name="title" defaultValue={card.title} required maxLength={200} className="input" />
            </label>
            <label className="block space-y-1">
              <span className="field-label">Descrição</span>
              <textarea name="description" defaultValue={card.description ?? ""} rows={4} className="input" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="field-label">Prazo</span>
                <input name="dueDate" type="date" defaultValue={toDateInput(card.dueDate)} className="input" />
              </label>
              <label className="block space-y-1">
                <span className="field-label">Responsável</span>
                <select name="assigneeId" defaultValue={card.assignee?.id ?? ""} disabled={!permissions.assign} className="input">
                  <option value="">Ninguém</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="space-y-1">
              <legend className="field-label mb-1.5 flex items-center gap-1.5"><Tag className="size-3.5" aria-hidden /> Etiquetas</legend>
              <div className="flex flex-wrap gap-2">
                {labelOptions.length === 0 && <span className="text-sm text-slate-500">Nenhuma etiqueta criada.</span>}
                {labelOptions.map((l) => (
                  <label key={l.id} className={`badge cursor-pointer gap-1.5 px-2 py-1 text-sm transition hover:brightness-95 ${LABEL_COLORS[l.color] ?? LABEL_COLORS.slate}`}>
                    <input type="checkbox" name="labelIds" value={l.id} defaultChecked={card.labels.some((cl) => cl.id === l.id)} />
                    {l.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>
          {!readOnly && <button className="btn-primary" disabled={pending}>Salvar</button>}
        </form>

        {!readOnly && <NewLabelForm onCreated={(l) => setLabelOptions((ls) => [...ls, l])} onResult={onResult} />}

        <Checklist card={card} readOnly={readOnly} onResult={onResult} />

        <CodeLinks card={card} readOnly={readOnly} onResult={onResult} />

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          {permissions.moveCard && (
            <label className="space-y-1">
              <span className="field-label block">Mover para a coluna</span>
              <select className="input" value={card.columnId} onChange={(e) => onMove(e.target.value)}>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          {!readOnly && (
            <button
              className="btn-danger"
              disabled={pending}
              onClick={() => {
                if (!confirm("Arquivar este cartão?")) return;
                startTransition(async () => {
                  if (onResult(await actions.archiveCard({ cardId: card.id }))) onClose();
                });
              }}
            >
              <Archive className="size-4" aria-hidden /> Arquivar
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Checklist({ card, readOnly, onResult }: { card: BoardCard; readOnly: boolean; onResult: Props["onResult"] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const done = card.checklist.filter((i) => i.done).length;

  return (
    <section aria-labelledby="checklist-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="checklist-title" className="field-label flex items-center gap-1.5">
          <CheckSquare className="size-3.5" aria-hidden /> Checklist {card.checklist.length > 0 && <span className="font-normal text-slate-500">({done}/{card.checklist.length})</span>}
        </h3>
        {card.checklist.length > 0 && (
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${(done / card.checklist.length) * 100}%` }} />
          </div>
        )}
      </div>
      <ul className="space-y-1">
        {card.checklist.map((item) => (
          <li key={item.id} className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                disabled={readOnly || pending}
                onChange={(e) => startTransition(async () => { onResult(await actions.toggleChecklistItem({ itemId: item.id, done: e.target.checked })); })}
              />
              <span className={item.done ? "text-slate-500 line-through" : ""}>{item.text}</span>
            </label>
            {!readOnly && (
              <button
                className="icon-btn size-7 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-600"
                aria-label={`Remover "${item.text}"`}
                title="Remover"
                disabled={pending}
                onClick={() => startTransition(async () => { onResult(await actions.deleteChecklistItem({ itemId: item.id })); })}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          ref={formRef}
          className="flex gap-2"
          action={(fd) =>
            startTransition(async () => {
              if (onResult(await actions.addChecklistItem({ cardId: card.id, text: String(fd.get("text")) }))) formRef.current?.reset();
            })
          }
        >
          <label className="sr-only" htmlFor="checklist-new">Novo item</label>
          <input id="checklist-new" name="text" required maxLength={300} placeholder="Novo item" className="input py-1" />
          <button className="btn" disabled={pending}>Adicionar</button>
        </form>
      )}
    </section>
  );
}

function NewLabelForm({ onCreated, onResult }: { onCreated: (l: LabelOption) => void; onResult: Props["onResult"] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <details>
      <summary className="link cursor-pointer text-sm">+ Nova etiqueta</summary>
      <form
        ref={formRef}
        className="mt-2 flex flex-wrap gap-2"
        action={(fd) =>
          startTransition(async () => {
            const result = await actions.createLabel({ name: String(fd.get("name")), color: String(fd.get("color")) });
            if (onResult(result) && result.ok) {
              onCreated(result.data);
              formRef.current?.reset();
            }
          })
        }
      >
        <label className="sr-only" htmlFor="label-name">Nome da etiqueta</label>
        <input id="label-name" name="name" required maxLength={40} placeholder="Nome" className="input w-40 py-1" />
        <label className="sr-only" htmlFor="label-color">Cor</label>
        <select id="label-color" name="color" className="input w-32 py-1">
          {Object.entries(LABEL_COLOR_NAMES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="btn" disabled={pending}>Criar</button>
      </form>
    </details>
  );
}

const LINK_STATE: Record<string, string> = { open: "aberto", closed: "fechado", merged: "integrado" };

function CodeLinks({ card, readOnly, onResult }: { card: BoardCard; readOnly: boolean; onResult: Props["onResult"] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const code = `PLT-${card.id.slice(-8)}`;
  return (
    <section aria-labelledby="links-title" className="space-y-2">
      <h3 id="links-title" className="field-label flex items-center gap-1.5"><GitPullRequest className="size-3.5" aria-hidden /> Pull requests</h3>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Cite <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{code}</code> no título, na descrição ou no branch do PR para vincular automaticamente.
      </p>
      {card.links.length > 0 && (
        <ul className="space-y-1 text-sm">
          {card.links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <a href={l.url} target="_blank" rel="noreferrer" className="link truncate">{l.title ?? l.url}</a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                {l.state ? LINK_STATE[l.state] ?? l.state : ""}
                {!readOnly && (
                  <button className="underline" disabled={pending} aria-label={`Remover vínculo ${l.url}`} onClick={() => startTransition(async () => { onResult(await actions.unlinkCardAction(l.id)); })}>
                    Remover
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form
          ref={formRef}
          className="flex gap-2"
          action={(fd) => startTransition(async () => {
            if (onResult(await actions.linkCardAction({ cardId: card.id, url: String(fd.get("url")) }))) formRef.current?.reset();
          })}
        >
          <label className="sr-only" htmlFor="link-url">Link do pull request</label>
          <input id="link-url" name="url" type="url" required placeholder="https://github.com/org/repo/pull/123" className="input py-1" />
          <button className="btn" disabled={pending}>Vincular</button>
        </form>
      )}
    </section>
  );
}
