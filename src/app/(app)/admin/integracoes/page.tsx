import { requireUser } from "@/lib/session";
import { INTEGRATION_FIELDS, INTEGRATION_LABELS, listIntegrations } from "@/lib/admin";
import { ActionForm } from "@/components/tickets/action-form";
import { ResultForm } from "@/components/admin/result-form";
import { formatDateTime } from "@/components/tickets/badges";
import { createIntegrationAction, toggleIntegrationAction } from "../actions";
import type { IntegrationType } from "@/generated/prisma/enums";

export const metadata = { title: "Integrações" };

const HELP: Record<IntegrationType, string> = {
  EMAIL: "Recebe chamados por e-mail (Postmark ou formato genérico) e responde pelo Resend.",
  SLACK: "Comando /plantao e avisos no canal da equipe. Escopos: commands, chat:write, users:read, users:read.email.",
  TEAMS: "Avisos por webhook de entrada; consultas pelo webhook de saída.",
  GITHUB: "Vincula pull requests a cartões (evento pull_request).",
  GITLAB: "Vincula merge requests a cartões (Merge request events).",
  GOOGLE_CALENDAR: "Escala de plantão usada na sugestão de responsável.",
  WEBHOOK: "Abertura de chamados por outros sistemas, com retorno das atualizações.",
  AUTOMATION: "Endpoint que executa as ações pré-aprovadas confirmadas.",
};

export default async function IntegrationsPage() {
  const user = await requireUser("integration:manage");
  const integrations = await listIntegrations(user);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Integrações</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">As configurações são cifradas antes de gravar. Segredos não são exibidos depois de criados.</p>

      {integrations.length > 0 && (
        <ul className="space-y-2">
          {integrations.map((i) => (
            <li key={i.id} className={`panel space-y-1.5 px-4 py-3 text-sm ${i.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{i.name} <span className="text-xs text-slate-500">· {INTEGRATION_LABELS[i.type]} · desde {formatDateTime(i.createdAt)}</span></span>
                <ActionForm action={toggleIntegrationAction.bind(null, i.id, !i.active)} resetOnSuccess={false}>
                  <button className="btn py-1 text-xs">{i.active ? "Desativar" : "Reativar"}</button>
                </ActionForm>
              </div>
              {Object.entries(i.summary).map(([k, v]) => <p key={k} className="text-xs"><span className="text-slate-500">{k}:</span> {v}</p>)}
              {i.inboundUrl && <p className="break-all text-xs"><span className="text-slate-500">URL:</span> <code>{i.inboundUrl}</code></p>}
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="section-title">Nova integração</h2>
        {(Object.keys(INTEGRATION_FIELDS) as IntegrationType[]).map((type) => (
          <details key={type} className="panel group p-0 text-sm transition open:shadow-lift">
            <summary className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">›</span>{INTEGRATION_LABELS[type]} <span className="font-normal text-slate-500">— {HELP[type]}</span></summary>
            <ResultForm action={createIntegrationAction.bind(null, type)} title="Integração criada" className="space-y-3 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
              <label className="block space-y-1.5"><span className="field-label text-xs">Nome</span><input name="name" defaultValue={INTEGRATION_LABELS[type]} className="input py-1.5" /></label>
              {INTEGRATION_FIELDS[type].map((f) => (
                <label key={f.name} className="block space-y-1">
                  <span className="field-label text-xs">{f.label}{f.generate ? " (deixe vazio para gerar)" : f.optional ? " (opcional)" : ""}</span>
                  {f.options ? (
                    <select name={`f.${f.name}`} className="input py-1.5">{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <input name={`f.${f.name}`} type={f.secret ? "password" : "text"} autoComplete="off" required={!f.optional && !f.generate} className="input py-1.5" />
                  )}
                </label>
              ))}
              <button className="btn-primary py-1.5">Criar</button>
            </ResultForm>
          </details>
        ))}
      </section>
    </div>
  );
}
