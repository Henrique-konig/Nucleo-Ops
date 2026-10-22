import { requireUser } from "@/lib/session";
import { listUsers } from "@/lib/admin";
import { ROLE_LABELS } from "@/lib/permissions";
import { ActionForm } from "@/components/tickets/action-form";
import { ResultForm } from "@/components/admin/result-form";
import { createUserAction, resetPasswordAction, updateUserAction } from "../actions";

export const metadata = { title: "Usuários" };

function RoleSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="role" defaultValue={defaultValue ?? "REQUESTER"} className="input py-1">
      {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default async function UsersPage() {
  const user = await requireUser("user:manage");
  const users = await listUsers(user);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Usuários e papéis</h1>
        <ResultForm action={createUserAction} title="Usuário criado" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <label className="space-y-1"><span className="block text-xs font-medium">Nome</span><input name="name" required className="input py-1" /></label>
          <label className="space-y-1"><span className="block text-xs font-medium">E-mail</span><input name="email" type="email" required className="input py-1" /></label>
          <label className="space-y-1"><span className="block text-xs font-medium">Papel</span><RoleSelect /></label>
          <button className="btn-primary py-1.5">Criar usuário</button>
        </ResultForm>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="p-2 font-medium">Pessoa</th>
              <th className="p-2 font-medium">Papel, acesso e Slack</th>
              <th className="p-2 font-medium">Senha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td className="p-2">
                  <span className="block font-medium">{u.name}</span>
                  <span className="text-xs text-slate-500">{u.email}</span>
                </td>
                <td className="p-2">
                  <ActionForm key={`${u.role}-${u.active}-${u.slackUserId}`} action={updateUserAction.bind(null, u.id)} resetOnSuccess={false} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${u.id}`}>Papel</label>
                    <RoleSelect defaultValue={u.role} />
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} /> Ativo</label>
                    <input name="slackUserId" defaultValue={u.slackUserId ?? ""} placeholder="Id no Slack" aria-label="Id no Slack" className="input w-28 py-1 text-xs" />
                    <button className="btn py-1">Salvar</button>
                  </ActionForm>
                </td>
                <td className="p-2">
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
