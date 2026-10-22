import { Fragment } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { auditFiltersSchema, auditPeople, queryAudit } from "@/lib/audit-log";
import { actionLabel, TARGET_LABELS } from "@/lib/audit-labels";
import { AGENT_LABELS } from "@/lib/admin";
import { formatDateTime } from "@/components/tickets/badges";
import { FileDown, FileSpreadsheet, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Pagination, pageHref } from "@/components/ui/pagination";

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
  const [{ rows, total, pages }, people] = await Promise.all([queryAudit(user, filters), auditPeople(user)]);
  const qs = (page: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v) as [string, string][]), page: String(page) }).toString();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Auditoria"
        description={`Registro imutável de todas as ações de pessoas e agentes (${total} registros).`}
        actions={
          <>
            <a className="btn" href={`/api/auditoria/csv?${qs(1)}`}><FileSpreadsheet className="size-4" aria-hidden /> Exportar CSV</a>
            <a className="btn" href={`/api/auditoria/pdf?${qs(1)}`}><FileDown className="size-4" aria-hidden /> Exportar PDF</a>
          </>
        }
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
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Pessoa</span>
          <select name="user" defaultValue={raw.user ?? ""} className="input py-1.5">
            <option value="">Qualquer pessoa</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inativo)"}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Tipo de alvo</span>
          <select name="targetType" defaultValue={raw.targetType ?? ""} className="input py-1.5">
            <option value="">Todos</option>
            {Object.entries(TARGET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title="Nenhum registro encontrado"
          action={<Link href="/auditoria" className="btn">Limpar filtros</Link>}
        >
          Nenhuma ação corresponde a esses filtros. Amplie o período ou remova algum critério.
        </EmptyState>
      ) : (
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
                  <td>
                    <span className="block text-sm">{actionLabel(r.type)}</span>
                    <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r.type}</code>
                  </td>
                  <td className="text-xs">
                    {TARGET_LINKS[r.targetType] ? <Link className="link" href={TARGET_LINKS[r.targetType](r.targetId)}>{TARGET_LABELS[r.targetType] ?? r.targetType}</Link> : (TARGET_LABELS[r.targetType] ?? r.targetType)}
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
      )}
      <Pagination page={filters.page} pages={pages} total={total} noun={["registro", "registros"]} href={(p) => pageHref("/auditoria", raw, p)} />
    </main>
  );
}
