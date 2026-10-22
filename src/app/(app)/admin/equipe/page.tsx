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
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Equipe</h1>
      <p className="rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
        Custo de IA neste mês: <strong>R$ {(spent / 100).toFixed(2)}</strong>
        {budget != null && <> de R$ {(budget / 100).toFixed(2)} ({Math.round((spent / Math.max(budget, 1)) * 100)}%)</>}
      </p>
      <ActionForm key={team.id + team.name + team.categories.join()} action={updateTeamAction} resetOnSuccess={false} successMessage="Equipe atualizada." className="space-y-3">
        <label className="block space-y-1"><span className="text-sm font-medium">Nome</span><input name="name" defaultValue={team.name} required className="input" /></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Fuso horário</span><input name="timezone" defaultValue={team.timezone} required className="input" /></label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Categorias (uma por linha)</span>
          <textarea name="categories" rows={7} defaultValue={team.categories.join("\n")} className="input" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Teto mensal de custo de IA (R$)</span>
          <input name="budget" inputMode="decimal" defaultValue={budget != null ? (budget / 100).toFixed(2) : ""} placeholder="sem teto" className="input" />
          <span className="block text-xs text-slate-500">Ao atingir 80% a equipe é avisada; no teto, os agentes param até o mês seguinte.</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Retenção de chamados encerrados (dias)</span>
          <input name="retentionDays" type="number" min={30} defaultValue={team.retentionDays ?? ""} placeholder="sem expurgo" className="input" />
          <span className="block text-xs text-slate-500">Depois desse prazo, o conteúdo dos chamados encerrados é apagado. O log de auditoria é mantido.</span>
        </label>
        <button className="btn-primary">Salvar</button>
      </ActionForm>
    </div>
  );
}
