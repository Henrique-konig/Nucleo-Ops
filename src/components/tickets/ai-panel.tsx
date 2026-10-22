import Link from "next/link";
import { ActionForm } from "./action-form";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };
type Draft = { id: string; content: string; sources: { type: "document" | "ticket"; id: string; title: string }[]; createdAt: Date };

/** Painel dos agentes na tela do chamado: triagem (desfazer/aceitar) e rascunho de resposta. */
export function AiPanel(props: {
  triage: { reason: string | null; suggestedAssignee: { id: string; name: string } | null; currentAssigneeId: string | null } | null;
  draft: Draft | null;
  researchActive: boolean;
  costBrl: number;
  canEdit: boolean;
  canAssign: boolean;
  undo: () => Promise<Result>;
  accept: () => Promise<Result>;
  request: () => Promise<Result>;
  send?: (fd: FormData) => Promise<Result>;
  discard?: () => Promise<Result>;
}) {
  const { triage, draft } = props;
  return (
    <section aria-labelledby="ai-panel" className="space-y-4 rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-sm dark:border-violet-900 dark:bg-violet-950/40">
      <div className="flex items-baseline justify-between">
        <h2 id="ai-panel" className="font-semibold">Assistente</h2>
        {props.costBrl > 0 && <span className="text-xs text-slate-600 dark:text-slate-400">Custo de IA: R$ {props.costBrl.toFixed(2)}</span>}
      </div>

      {triage && (
        <div className="space-y-2">
          <p><span className="font-medium">Triagem automática.</span> {triage.reason}</p>
          <div className="flex flex-wrap gap-2">
            {props.canEdit && (
              <ActionForm action={props.undo} resetOnSuccess={false}><button className="btn">Desfazer triagem</button></ActionForm>
            )}
            {props.canAssign && triage.suggestedAssignee && triage.suggestedAssignee.id !== triage.currentAssigneeId && (
              <ActionForm action={props.accept} resetOnSuccess={false}>
                <button className="btn">Atribuir a {triage.suggestedAssignee.name}</button>
              </ActionForm>
            )}
          </div>
        </div>
      )}

      {draft && props.send ? (
        <ActionForm action={props.send} className="space-y-2">
          <label className="block space-y-1">
            <span className="font-medium">Rascunho de resposta (revise antes de enviar)</span>
            <textarea name="content" defaultValue={draft.content} rows={8} className="input" />
          </label>
          {draft.sources.length > 0 ? (
            <div>
              <p className="text-xs font-medium">Fontes</p>
              <ul className="list-disc pl-5 text-xs">
                {draft.sources.map((s) => (
                  <li key={s.id}>
                    <Link className="underline" href={s.type === "document" ? `/base/${s.id}` : `/chamados/${s.id}`}>
                      {s.type === "document" ? "Documento" : "Chamado"}: {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-300">Sem fontes na base de conhecimento: confira com cuidado.</p>
          )}
          {props.canEdit && <button className="btn-primary">Enviar ao solicitante</button>}
        </ActionForm>
      ) : (
        props.researchActive && props.canEdit && (
          <ActionForm action={props.request} resetOnSuccess={false} successMessage="Pedido enviado. O rascunho aparece aqui em instantes.">
            <button className="btn">Gerar rascunho de resposta</button>
          </ActionForm>
        )
      )}
      {draft && props.discard && props.canEdit && (
        <ActionForm action={props.discard} resetOnSuccess={false}>
          <button className="text-xs text-slate-600 underline dark:text-slate-400">Descartar rascunho</button>
        </ActionForm>
      )}
    </section>
  );
}
