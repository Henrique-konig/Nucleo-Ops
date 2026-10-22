import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { describePermission, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, can, type Permission, type PermissionGroup } from "@/lib/permissions";

export const metadata = { title: "Perfis de acesso" };

export default async function ProfilesPage() {
  const user = await requireUser("user:manage");
  const counts = await db.user.groupBy({
    by: ["role"],
    where: { teamId: user.teamId, active: true, NOT: { email: { startsWith: "sistema+" } } },
    _count: { _all: true },
  });
  const countOf = Object.fromEntries(counts.map((c) => [c.role, c._count._all]));

  const groups = new Map<PermissionGroup, Permission[]>();
  for (const p of Object.keys(PERMISSIONS) as Permission[]) {
    const { group } = describePermission(p);
    groups.set(group, [...(groups.get(group) ?? []), p]);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="page-title">Perfis de acesso</h1>
        <p className="page-subtitle">
          O que cada papel pode fazer. Para mudar o papel de alguém, use <Link className="link" href="/admin/usuarios">Usuários</Link>; toda mudança fica na <Link className="link" href="/auditoria?type=user.">auditoria</Link>.
        </p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((role) => (
          <li key={role} className="panel space-y-1 p-4">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{ROLE_LABELS[role]}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{countOf[role] ?? 0} {(countOf[role] ?? 0) === 1 ? "pessoa" : "pessoas"}</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{ROLE_DESCRIPTIONS[role]}</p>
          </li>
        ))}
      </ul>

      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Permissões por papel</caption>
          <thead>
            <tr>
              <th scope="col">Permissão</th>
              {ROLES.map((role) => <th key={role} scope="col" className="text-center">{ROLE_LABELS[role]}</th>)}
            </tr>
          </thead>
          {[...groups].map(([group, permissions]) => (
            <tbody key={group}>
              <tr>
                <th scope="colgroup" colSpan={ROLES.length + 1} className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-900/60 dark:text-slate-400">{group}</th>
              </tr>
              {permissions.map((p) => (
                <tr key={p}>
                  <th scope="row" className="text-left font-normal">
                    {describePermission(p).label}
                    <code className="ml-2 text-xs text-slate-400">{p}</code>
                  </th>
                  {ROLES.map((role) => (
                    <td key={role} className="text-center">
                      {can(role, p)
                        ? <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label="Permitido" />
                        : <Minus className="mx-auto size-4 text-slate-300 dark:text-slate-600" aria-label="Não permitido" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
