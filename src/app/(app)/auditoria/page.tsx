import { Fragment } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { auditFiltersSchema, queryAudit } from "@/lib/audit-log";
import { AGENT_LABELS } from "@/lib/admin";
import { formatDateTime } from "@/components/tickets/badges";

export const metadata = { title: "Auditoria" };

const TARGET_LINKS: Record<string, (id: string) => string> = {
  ticket: (id) => `/chamados/${id}`,
  document: (id) => `/base/${id}`,
};

export default async function AuditPage({ searchParams }: PageProps<"/auditoria">) {
  const user = await requireUser("audit:view");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined]));
  const parsed = auditFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : { page: 1 };
  const { rows, total, pages } = await queryAudit(user, filters);
  const qs = (page: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v) as [string, string][]), page: String(page) }).toString();

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Auditoria</h1>
        <a className="btn" href={`/api/auditoria/csv?${qs(1)}`}>Exportar CSV</a>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">Registro imutável de todas as ações de pessoas e agentes ({total} registros).</p>
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="space-y-1">
          <span className="block text-xs font-medium">Autor</span>
          <select name="actor" defaultValue={raw.actor ?? ""} className="input py-1">
            <option value="">Todos</option>
            <option value="user">Pessoas</option>
            <option value="agent">Agentes</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Ação (prefixo)</span>
          <input name="type" defaultValue={raw.type} placeholder="ex.: execution, card.move" className="input w-48 py-1" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Id do alvo</span>
          <input name="target" defaultValue={raw.target} className="input w-56 py-1" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">De</span>
          <input type="date" name="from" defaultValue={raw.from} className="input py-1" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Até</span>
          <input type="date" name="to" defaultValue={raw.to} className="input py-1" />
        </label>
        <button className="btn">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="p-2 font-medium">Quando</th>
              <th className="p-2 font-medium">Quem</th>
              <th className="p-2 font-medium">Ação</th>
              <th className="p-2 font-medium">Alvo</th>
              <th className="p-2 font-medium">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top dark:divide-slate-800">
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="whitespace-nowrap p-2">{formatDateTime(r.createdAt)}</td>
                  <td className="p-2">
                    {r.user ? r.user.name : <span className="rounded bg-violet-100 px-1.5 text-violet-900 dark:bg-violet-900 dark:text-violet-100">Agente {AGENT_LABELS[r.agent!.type]}</span>}
                    {r.confirmedBy && <span className="block text-xs text-slate-500">confirmado por {r.confirmedBy.name}</span>}
                  </td>
                  <td className="p-2 font-mono text-xs">{r.type}</td>
                  <td className="p-2 text-xs">
                    {TARGET_LINKS[r.targetType] ? <Link className="underline" href={TARGET_LINKS[r.targetType](r.targetId)}>{r.targetType}</Link> : r.targetType}
                    <span className="block font-mono text-slate-500">{r.targetId.slice(-10)}</span>
                  </td>
                  <td className="max-w-md break-all p-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.payload != null && JSON.stringify(r.payload).slice(0, 300)}
                    {r.result != null && <span className="block text-slate-500">→ {JSON.stringify(r.result).slice(0, 200)}</span>}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Páginas" className="flex items-center gap-3 text-sm">
        {filters.page > 1 && <Link className="underline" href={`/auditoria?${qs(filters.page - 1)}`}>Anterior</Link>}
        <span>Página {filters.page} de {pages}</span>
        {filters.page < pages && <Link className="underline" href={`/auditoria?${qs(filters.page + 1)}`}>Próxima</Link>}
      </nav>
    </main>
  );
}
