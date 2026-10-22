import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { monthSpendBrlCents } from "@/lib/ai/budget";
import { ActionForm } from "@/components/tickets/action-form";
import { updateTeamAction } from "../actions";

export const metadata = { title: "Equipe" };

export default async function TeamPage() {
  const user = await requireUser("team:manage");
  const [team, spent] = await Promise.all([db.team.findUniqueOrThrow({ where: { id: user.teamId } }), monthSpendBrlCents(user.teamId)]);
  const budget = team.aiMonthlyBudgetCents;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title">Equipe</h1>
      <div className="panel space-y-3 p-5 text-sm">
        <p className="eyebrow">Custo de IA neste mês</p>
        <p>
          <strong className="text-2xl font-semibold tracking-tight">R$ {(spent / 100).toFixed(2)}</strong>
          {budget != null && <span className="text-slate-500 dark:text-slate-400"> de R$ {(budget / 100).toFixed(2)} ({Math.round((spent / Math.max(budget, 1)) * 100)}%)</span>}
        </p>
        {budget != null && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <div
              className={`h-full rounded-full transition-all ${spent / Math.max(budget, 1) >= 0.8 ? "bg-amber-500" : "bg-brand-500"}`}
              style={{ width: `${Math.min(100, (spent / Math.max(budget, 1)) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <ActionForm key={team.id + team.name + team.categories.join()} action={updateTeamAction} resetOnSuccess={false} successMessage="Equipe atualizada." className="panel space-y-4 p-5">
        <label className="block space-y-1.5"><span className="field-label">Nome</span><input name="name" defaultValue={team.name} required className="input" /></label>
        <label className="block space-y-1.5"><span className="field-label">Fuso horário</span><input name="timezone" defaultValue={team.timezone} required className="input" /></label>
        <label className="block space-y-1.5">
          <span className="field-label">Categorias (uma por linha)</span>
          <textarea name="categories" rows={7} defaultValue={team.categories.join("\n")} className="input" />
        </label>
        <label className="block space-y-1.5">
          <span className="field-label">Teto mensal de custo de IA (R$)</span>
          <input name="budget" inputMode="decimal" defaultValue={budget != null ? (budget / 100).toFixed(2) : ""} placeholder="sem teto" className="input" />
          <span className="block text-xs text-slate-500">Ao atingir 80% a equipe é avisada; no teto, os agentes param até o mês seguinte.</span>
        </label>
        <label className="block space-y-1.5">
          <span className="field-label">Retenção de chamados encerrados (dias)</span>
          <input name="retentionDays" type="number" min={30} defaultValue={team.retentionDays ?? ""} placeholder="sem expurgo" className="input" />
          <span className="block text-xs text-slate-500">Depois desse prazo, o conteúdo dos chamados encerrados é apagado. O log de auditoria é mantido.</span>
        </label>
        <button className="btn-primary">Salvar</button>
      </ActionForm>
    </div>
  );
}
