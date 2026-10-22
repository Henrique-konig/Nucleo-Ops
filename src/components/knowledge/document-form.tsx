import { ActionForm } from "@/components/tickets/action-form";

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
      <fieldset disabled={readOnly} className="panel space-y-4 p-5">
        <label className="block space-y-1.5">
          <span className="field-label">Título</span>
          <input name="title" required minLength={3} maxLength={200} defaultValue={doc?.title} className="input" />
        </label>
        <label className="block space-y-1.5">
          <span className="field-label">Conteúdo</span>
          <textarea name="content" required minLength={10} rows={16} defaultValue={doc?.content} className="input font-mono text-[13px] leading-relaxed" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="field-label">Fonte (link ou sistema de origem)</span>
            <input name="source" maxLength={500} defaultValue={doc?.source ?? ""} className="input" />
          </label>
          <label className="block space-y-1.5">
            <span className="field-label">Válido até</span>
            <input name="validUntil" type="date" defaultValue={doc?.validUntil ? new Date(doc.validUntil).toISOString().slice(0, 10) : ""} className="input" />
            <span className="block text-xs text-slate-500">Depois dessa data o documento sai das buscas dos agentes até ser revisado.</span>
          </label>
        </div>
      </fieldset>
      {!readOnly && <button className="btn-primary">{submitLabel}</button>}
    </ActionForm>
  );
}
