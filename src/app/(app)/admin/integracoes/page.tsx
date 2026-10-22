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
      <h1 className="text-xl font-semibold">Integrações</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">As configurações são cifradas antes de gravar. Segredos não são exibidos depois de criados.</p>

      {integrations.length > 0 && (
        <ul className="space-y-2">
          {integrations.map((i) => (
            <li key={i.id} className={`space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900 ${i.active ? "" : "opacity-60"}`}>
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
        <h2 className="text-lg font-semibold">Nova integração</h2>
        {(Object.keys(INTEGRATION_FIELDS) as IntegrationType[]).map((type) => (
          <details key={type} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer font-medium">{INTEGRATION_LABELS[type]} <span className="font-normal text-slate-500">— {HELP[type]}</span></summary>
            <ResultForm action={createIntegrationAction.bind(null, type)} title="Integração criada" className="mt-3 space-y-2">
              <label className="block space-y-1"><span className="text-xs font-medium">Nome</span><input name="name" defaultValue={INTEGRATION_LABELS[type]} className="input py-1" /></label>
              {INTEGRATION_FIELDS[type].map((f) => (
                <label key={f.name} className="block space-y-1">
                  <span className="text-xs font-medium">{f.label}{f.generate ? " (deixe vazio para gerar)" : f.optional ? " (opcional)" : ""}</span>
                  {f.options ? (
                    <select name={`f.${f.name}`} className="input py-1">{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <input name={`f.${f.name}`} type={f.secret ? "password" : "text"} autoComplete="off" required={!f.optional && !f.generate} className="input py-1" />
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
