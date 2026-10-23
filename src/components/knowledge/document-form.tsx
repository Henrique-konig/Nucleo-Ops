import { ActionForm } from "@/components/tickets/action-form";
import { DatePicker } from "@/components/ui/date-picker";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export function DocumentForm({
  action, doc, readOnly, submitLabel,
}: {
  action: (fd: FormData) => Promise<Result>;
  doc?: { title: string; content: string; source: string | null; validUntil: Date | null };
  readOnly?: boolean;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={false} successMessage="Documento salvo." className="space-y-4">
      <div className="panel overflow-hidden">
        <fieldset disabled={readOnly} className="space-y-5 p-5 sm:p-6">
          <label className="block space-y-1.5">
            <span className="field-label">Título</span>
            <input name="title" required minLength={3} maxLength={200} defaultValue={doc?.title} placeholder="Ex.: Como redefinir a senha da VPN" className="input" />
          </label>
          <label className="block space-y-1.5">
            <span className="field-label">Conteúdo</span>
            <textarea name="content" required minLength={10} rows={14} defaultValue={doc?.content} placeholder="Passo a passo, comandos e observações." className="input min-h-48 resize-y font-mono text-[13px] leading-relaxed" />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="field-label">Fonte <span className="font-normal text-slate-500 dark:text-slate-400">(opcional)</span></span>
              <input name="source" maxLength={500} defaultValue={doc?.source ?? ""} placeholder="Link ou sistema de origem" className="input" />
            </label>
            <div className="space-y-1.5">
              <span aria-hidden className="field-label block">Válido até <span className="font-normal text-slate-500 dark:text-slate-400">(opcional)</span></span>
              <DatePicker name="validUntil" label="Válido até" defaultValue={doc?.validUntil ? new Date(doc.validUntil).toISOString().slice(0, 10) : ""} />
              <span className="block text-xs text-slate-500 dark:text-slate-400">Depois dessa data o documento sai das buscas dos agentes até ser revisado.</span>
            </div>
          </div>
        </fieldset>
        {!readOnly && (
          <div className="flex justify-end border-t border-slate-200/80 bg-slate-50/70 px-5 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-950/30">
            <button className="btn-primary">{submitLabel}</button>
          </div>
        )}
      </div>
    </ActionForm>
  );
}
