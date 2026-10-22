import { requireUser } from "@/lib/session";
import { AGENT_LABELS, listAgents } from "@/lib/admin";
import { ACTIONS } from "@/lib/execution/catalog";
import { ActionForm } from "@/components/tickets/action-form";
import { stopAgentAction, updateAgentAction } from "../actions";

export const metadata = { title: "Agentes" };

const PERMISSIONS = {
  TRIAGE: { reads: "Chamado e categorias", writes: "Categoria, prioridade e responsável sugeridos", confirm: "Não, mas a sugestão pode ser desfeita" },
  RESEARCH: { reads: "Base de conhecimento e histórico de chamados", writes: "Rascunho de resposta", confirm: "Sim, antes de enviar ao solicitante" },
  CHATBOT: { reads: "Base de conhecimento e chamados do solicitante", writes: "Respostas de primeiro nível no chat", confirm: "Não; passa para a equipe quando não resolve" },
  EXECUTION: { reads: "Ações pré-aprovadas e seus alvos", writes: "Ações da lista de permitidas", confirm: "Sim, em toda ação" },
  SUMMARY: { reads: "Ações e chamados do período", writes: "Relatório gerado", confirm: "Não" },
} as const;

export default async function AgentsPage() {
  const user = await requireUser("agent:manage");
  const agents = await listAgents(user);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Agentes</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Cada agente opera com o mínimo de permissão e registra todas as ações. Em simulação, registra o que faria sem alterar nada.
      </p>
      {agents.map((a) => (
        <section key={a.id} aria-labelledby={`agent-${a.id}`} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`agent-${a.id}`} className="font-semibold">
              {AGENT_LABELS[a.type]}{" "}
              {a.pausedReason ? (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-900 dark:bg-red-900 dark:text-red-100">{a.pausedReason}</span>
              ) : a.active ? (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-900 dark:bg-green-900 dark:text-green-100">Ativo{a.dryRun ? " · simulação" : ""}</span>
              ) : (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">Desligado</span>
              )}
            </h2>
            <span className="text-xs text-slate-500">{a.actionsLastDay} ações nas últimas 24 h</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
            <dt className="text-slate-500">Pode ler</dt><dd>{PERMISSIONS[a.type].reads}</dd>
            <dt className="text-slate-500">Pode escrever</dt><dd>{PERMISSIONS[a.type].writes}</dd>
            <dt className="text-slate-500">Confirmação humana</dt><dd>{PERMISSIONS[a.type].confirm}</dd>
          </dl>
          <ActionForm key={`${a.active}-${a.dryRun}-${JSON.stringify(a.limits)}`} action={updateAgentAction.bind(null, a.id)} resetOnSuccess={false} successMessage="Configuração salva." className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={a.active && !a.pausedReason} /> Ativo</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="dryRun" defaultChecked={a.dryRun} /> Modo de simulação</label>
              <label className="flex items-center gap-1">Por minuto <input name="perMinute" type="number" min={1} defaultValue={a.limits.perMinute} className="input w-20 py-1" /></label>
              <label className="flex items-center gap-1">Por dia <input name="perDay" type="number" min={1} defaultValue={a.limits.perDay} className="input w-24 py-1" /></label>
            </div>
            {a.type === "EXECUTION" && (
              <fieldset className="space-y-1">
                <legend className="text-xs font-medium">Ações permitidas</legend>
                {Object.entries(ACTIONS).map(([key, action]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" name="allowedActions" value={key} defaultChecked={a.limits.allowedActions.includes(key)} />
                    {action.label} <span className="text-xs text-slate-500">— {action.description}{action.sensitive ? " (sensível)" : ""}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <button className="btn">Salvar</button>
          </ActionForm>
          {a.active && !a.pausedReason && (
            <ActionForm action={stopAgentAction.bind(null, a.id)} resetOnSuccess={false}>
              <button className="btn-danger">Parar agora</button>
            </ActionForm>
          )}
        </section>
      ))}
    </div>
  );
}
