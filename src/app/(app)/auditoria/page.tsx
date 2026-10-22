import { Fragment } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { auditFiltersSchema, queryAudit } from "@/lib/audit-log";
import { AGENT_LABELS } from "@/lib/admin";
import { formatDateTime } from "@/components/tickets/badges";
import { ChevronLeft, ChevronRight, Download, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

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
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Auditoria"
        description={`Registro imutável de todas as ações de pessoas e agentes (${total} registros).`}
        actions={<a className="btn" href={`/api/auditoria/csv?${qs(1)}`}><Download className="size-4" aria-hidden /> Exportar CSV</a>}
      />
      <form className="panel flex flex-wrap items-end gap-3 p-3" role="search">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Autor</span>
          <select name="actor" defaultValue={raw.actor ?? ""} className="input py-1.5">
            <option value="">Todos</option>
            <option value="user">Pessoas</option>
            <option value="agent">Agentes</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Ação (prefixo)</span>
          <input name="type" defaultValue={raw.type} placeholder="ex.: execution, card.move" className="input w-48 py-1.5" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Id do alvo</span>
          <input name="target" defaultValue={raw.target} className="input w-56 py-1.5" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">De</span>
          <input type="date" name="from" defaultValue={raw.from} className="input py-1.5" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Até</span>
          <input type="date" name="to" defaultValue={raw.to} className="input py-1.5" />
        </label>
        <button className="btn-primary py-1.5"><SlidersHorizontal className="size-4" aria-hidden /> Filtrar</button>
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>Alvo</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDateTime(r.createdAt)}</td>
                  <td>
                    {r.user ? r.user.name : <span className="badge bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">Agente {AGENT_LABELS[r.agent!.type]}</span>}
                    {r.confirmedBy && <span className="block text-xs text-slate-500">confirmado por {r.confirmedBy.name}</span>}
                  </td>
                  <td><code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r.type}</code></td>
                  <td className="text-xs">
                    {TARGET_LINKS[r.targetType] ? <Link className="link" href={TARGET_LINKS[r.targetType](r.targetId)}>{r.targetType}</Link> : r.targetType}
                    <span className="block font-mono text-slate-500">{r.targetId.slice(-10)}</span>
                  </td>
                  <td className="max-w-md break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.payload != null && JSON.stringify(r.payload).slice(0, 300)}
                    {r.result != null && <span className="block text-slate-500">→ {JSON.stringify(r.result).slice(0, 200)}</span>}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Página {filters.page} de {pages}</span>
        <span className="flex gap-2">
          {filters.page > 1 && <Link className="btn" href={`/auditoria?${qs(filters.page - 1)}`}><ChevronLeft className="size-4" aria-hidden /> Anterior</Link>}
          {filters.page < pages && <Link className="btn" href={`/auditoria?${qs(filters.page + 1)}`}>Próxima <ChevronRight className="size-4" aria-hidden /></Link>}
        </span>
      </nav>
    </main>
  );
}
