import { requireUser } from "@/lib/session";
import { AUTOMATION_LABELS, listAutomations } from "@/lib/automations";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/tickets/action-form";
import { createAutomationAction, toggleAutomationAction } from "../actions";

export const metadata = { title: "Automações" };

export default async function AutomationsPage() {
  const user = await requireUser("automation:configure");
  const [rules, columns, members] = await Promise.all([
    listAutomations(user),
    db.column.findMany({ where: { board: { teamId: user.teamId } }, include: { board: { select: { name: true } } }, orderBy: [{ boardId: "asc" }, { position: "asc" }] }),
    db.user.findMany({ where: { teamId: user.teamId, active: true, role: { in: ["TECHNICIAN", "COORDINATOR", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const memberName = (id: unknown) => members.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <h1 className="page-title">Automações do quadro</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Quando um cartão entra na coluna, a ação é executada. Toda execução fica no log de auditoria.</p>

      {rules.length === 0 ? (
        <p className="empty py-8">Nenhuma automação. Crie a primeira abaixo.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => {
            const config = r.config as { message?: string; userId?: string };
            return (
              <li key={r.id} className={`panel flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${r.active ? "" : "opacity-60"}`}>
                <span>
                  Ao entrar em <strong>{r.column.name}</strong> ({r.column.board.name}): {AUTOMATION_LABELS[r.action]}
                  {r.action === "ASSIGN" ? ` → ${memberName(config.userId)}` : config.message ? ` — “${config.message}”` : ""}
                </span>
                <ActionForm action={toggleAutomationAction.bind(null, r.id, !r.active)} resetOnSuccess={false}>
                  <button className="btn py-1 text-xs">{r.active ? "Desativar" : "Reativar"}</button>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      )}

      <section className="panel space-y-4 p-5">
        <h2 className="section-title">Nova automação</h2>
        <ActionForm action={createAutomationAction} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Quando o cartão entrar em</span>
            <select name="columnId" required className="input py-1.5">
              {columns.map((c) => <option key={c.id} value={c.id}>{c.board.name} › {c.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Fazer</span>
            <select name="action" className="input py-1.5">
              {Object.entries(AUTOMATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Mensagem (avisos)</span>
            <input name="message" maxLength={500} className="input py-1.5" placeholder="ex.: Cartão aguardando revisão" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Responsável (atribuição)</span>
            <select name="userId" className="input py-1.5" defaultValue="">
              <option value="">—</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div><button className="btn-primary py-1.5">Criar automação</button></div>
        </ActionForm>
      </section>
    </div>
  );
}
