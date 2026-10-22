import { requireUser } from "@/lib/session";
import { listUsers } from "@/lib/admin";
import { ROLE_LABELS } from "@/lib/permissions";
import { ActionForm } from "@/components/tickets/action-form";
import { ResultForm } from "@/components/admin/result-form";
import { initials } from "@/lib/initials";
import { createUserAction, resetPasswordAction, updateUserAction } from "../actions";

export const metadata = { title: "Usuários" };

function RoleSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="role" defaultValue={defaultValue ?? "REQUESTER"} className="input py-1.5">
      {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default async function UsersPage() {
  const user = await requireUser("user:manage");
  const users = await listUsers(user);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h1 className="page-title">Usuários e papéis</h1>
        <ResultForm action={createUserAction} title="Usuário criado" className="panel flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-1"><span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Nome</span><input name="name" required className="input py-1.5" /></label>
          <label className="space-y-1"><span className="block text-xs font-medium text-slate-500 dark:text-slate-400">E-mail</span><input name="email" type="email" required className="input py-1.5" /></label>
          <label className="space-y-1"><span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Papel</span><RoleSelect /></label>
          <button className="btn-primary py-1.5">Criar usuário</button>
        </ResultForm>
      </section>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Papel, acesso e Slack</th>
              <th>Senha</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td>
                  <span className="flex items-center gap-3">
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-[11px] font-semibold text-slate-700 dark:from-slate-700 dark:to-slate-800 dark:text-slate-200">{initials(u.name)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium">{u.name}</span>
                      <span className="text-xs text-slate-500">{u.email}</span>
                    </span>
                  </span>
                </td>
                <td>
                  <ActionForm key={`${u.role}-${u.active}-${u.slackUserId}`} action={updateUserAction.bind(null, u.id)} resetOnSuccess={false} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${u.id}`}>Papel</label>
                    <RoleSelect defaultValue={u.role} />
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} /> Ativo</label>
                    <input name="slackUserId" defaultValue={u.slackUserId ?? ""} placeholder="Id no Slack" aria-label="Id no Slack" className="input w-28 py-1.5 text-xs" />
                    <button className="btn py-1">Salvar</button>
                  </ActionForm>
                </td>
                <td>
                  <ResultForm action={resetPasswordAction.bind(null, u.id)} title="Nova senha">
                    <button className="btn py-1 text-xs">{u.passwordHash ? "Redefinir senha" : "Criar senha"}</button>
                  </ResultForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
