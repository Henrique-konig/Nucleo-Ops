"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Inbox, KanbanSquare, MoreHorizontal, Plus, UserRound } from "lucide-react";
import type { BoardSummary } from "@/lib/boards";
import { createBoardAction, deleteBoardAction, setIntakeBoardAction, updateBoardAction } from "@/app/(app)/boards/actions";
import { Modal } from "@/components/ui/modal";
import { ACCENTS, accent } from "@/components/ui/accent";

type BoardOption = { id: string; name: string };

export function BoardsManager({ boards, canManage }: { boards: BoardSummary[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BoardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Não foi possível concluir");
      router.refresh();
    });
  }

  return (
    <>
      {error && <p role="alert" className="alert-error">{error}</p>}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((b, i) => {
          const style = accent(b.color);
          return (
            <li key={b.id} className="relative animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Link href={`/boards/${b.id}`} className="panel panel-hover group flex h-full flex-col gap-4 overflow-hidden p-5 pt-6">
                <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.bar}`} />
                <span className="flex items-start gap-3 pr-8">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 ${style.soft}`}>
                    <KanbanSquare className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{b.name}</span>
                    <span className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{b.description || `${b.columnCount} ${b.columnCount === 1 ? "coluna" : "colunas"}`}</span>
                  </span>
                </span>
                <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="tabular-nums"><strong className="font-semibold text-slate-800 dark:text-slate-100">{b.cardCount}</strong> {b.cardCount === 1 ? "cartão" : "cartões"}</span>
                  {b.mineCount > 0 && (
                    <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" aria-hidden /> {b.mineCount} comigo</span>
                  )}
                  {b.overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="size-3.5" aria-hidden /> {b.overdueCount} atrasado{b.overdueCount === 1 ? "" : "s"}</span>
                  )}
                  {b.isIntake && (
                    <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" title="Os cartões dos chamados novos entram neste quadro">
                      <Inbox className="size-3" aria-hidden /> Recebe chamados
                    </span>
                  )}
                  <ArrowRight className="ml-auto size-4 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
              {canManage && (
                <details className="absolute top-4 right-3">
                  <summary className="icon-btn size-8 cursor-pointer" aria-label={`Opções do quadro ${b.name}`}>
                    <MoreHorizontal className="size-4" aria-hidden />
                  </summary>
                  <div className="menu">
                    <button className="menu-item" onClick={() => setEditing(b)}>Editar</button>
                    <button className="menu-item" disabled={b.isIntake || pending} onClick={() => run(() => setIntakeBoardAction({ boardId: b.id }))}>
                      Receber os chamados novos aqui
                    </button>
                    <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" aria-hidden />
                    <button
                      className="menu-item text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/60"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Excluir o quadro "${b.name}"? Só é possível sem cartões ativos.`)) run(() => deleteBoardAction({ boardId: b.id }));
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {editing && <BoardFormModal board={editing} boards={[]} onClose={() => setEditing(null)} />}
    </>
  );
}

export function NewBoardButton({ boards, autoOpen }: { boards: BoardOption[]; autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => setOpen(autoOpen), [autoOpen]);
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Novo quadro</button>
      {open && <BoardFormModal boards={boards} onClose={() => setOpen(false)} />}
    </>
  );
}

function BoardFormModal({ board, boards, onClose }: { board?: BoardSummary; boards: BoardOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<"default" | "blank" | "copy">("default");
  const [color, setColor] = useState(board?.color ?? "brand");

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const base = { name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? ""), color };
      if (board) {
        const result = await updateBoardAction({ boardId: board.id, ...base });
        if (!result.ok) return setError(result.error);
        onClose();
        router.refresh();
      } else {
        const result = await createBoardAction({ ...base, template, copyFromBoardId: template === "copy" ? String(fd.get("copyFrom")) : undefined });
        if (!result.ok) return setError(result.error);
        router.push(`/boards/${result.data.id}`);
      }
    });
  }

  return (
    <Modal title={board ? "Editar quadro" : "Novo quadro"} description={board ? undefined : "Um quadro para cada fluxo: atendimento, projetos, mudanças…"} onClose={onClose}>
      <form action={submit} className="space-y-4">
        {error && <p role="alert" className="alert-error">{error}</p>}
        <label className="block space-y-1">
          <span className="field-label">Nome</span>
          <input name="name" required maxLength={60} defaultValue={board?.name} autoFocus className="input" placeholder="Ex.: Projetos de infraestrutura" />
        </label>
        <label className="block space-y-1">
          <span className="field-label">Descrição <span className="font-normal text-slate-500">(opcional)</span></span>
          <textarea name="description" maxLength={300} rows={2} defaultValue={board?.description ?? ""} className="input" placeholder="Para que serve este quadro" />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="field-label mb-1.5">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ACCENTS).map(([value, style]) => (
              <label key={value} title={style.name} className={`grid size-8 cursor-pointer place-items-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900 ${color === value ? "ring-brand-500" : "ring-transparent hover:ring-slate-300"}`}>
                <input type="radio" name="color" value={value} checked={color === value} onChange={() => setColor(value)} className="sr-only" />
                <span aria-hidden className={`size-6 rounded-full ${style.dot}`} />
                <span className="sr-only">{style.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!board && (
          <fieldset className="space-y-2">
            <legend className="field-label mb-1.5">Colunas iniciais</legend>
            {([
              ["default", "Padrão de atendimento", "Entrada, Em andamento, Em revisão e Concluído, já ligadas ao status do chamado."],
              ["blank", "Em branco", "Você cria as colunas depois."],
              ["copy", "Copiar de outro quadro", "Mesmas colunas e status de um quadro existente."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition ${template === value ? "border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30" : "border-slate-200 hover:border-slate-300 dark:border-slate-800"}`}>
                <input type="radio" name="template" value={value} checked={template === value} onChange={() => setTemplate(value)} disabled={value === "copy" && boards.length === 0} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                </span>
              </label>
            ))}
            {template === "copy" && (
              <label className="block space-y-1">
                <span className="sr-only">Quadro de origem</span>
                <select name="copyFrom" className="input" required>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
          </fieldset>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={pending}>{board ? "Salvar" : "Criar quadro"}</button>
        </div>
      </form>
    </Modal>
  );
}
