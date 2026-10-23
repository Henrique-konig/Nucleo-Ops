import Link from "next/link";
import { FileDown, FileSpreadsheet, Inbox, Plus, Search, SlidersHorizontal } from "lucide-react";
import { can } from "@/lib/permissions";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { requireUser } from "@/lib/session";
import { CHANNEL_LABELS, listTicketsPage, PRIORITY_LABELS, STATUS_LABELS, ticketFiltersSchema } from "@/lib/tickets";
import { db } from "@/lib/db";
import { PriorityBadge, StatusBadge, formatDateTime } from "@/components/tickets/badges";

export const metadata = { title: "Chamados" };

export default async function TicketsPage({ searchParams }: PageProps<"/chamados">) {
  const user = await requireUser("board:view");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined]));
  const parsed = ticketFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : {};
  const filtered = Boolean(filters.q || filters.priority || filters.category || filters.mine || (filters.status && filters.status !== "ACTIVE"));
  const [{ rows: tickets, total, page, pages }, team] = await Promise.all([
    listTicketsPage(user, { status: "ACTIVE", ...filters }, Number(raw.page ?? 1)),
    db.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { categories: true } }),
  ]);
  // A exportação leva os mesmos filtros da tela.
  const exportQs = (formato: "csv" | "pdf") =>
    new URLSearchParams({ ...(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>), formato }).toString();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Chamados"
        description={`${total} ${total === 1 ? "chamado encontrado" : "chamados encontrados"}`}
        actions={
          <>
            {can(user.role, "ticket:export") && (
              <>
                <a className="btn" href={`/api/chamados/exportar?${exportQs("csv")}`}><FileSpreadsheet className="size-4" aria-hidden /> Exportar CSV</a>
                <a className="btn" href={`/api/chamados/exportar?${exportQs("pdf")}`}><FileDown className="size-4" aria-hidden /> Exportar PDF</a>
              </>
            )}
            {can(user.role, "ticket:create") && <Link className="btn-primary" href="/solicitante#novo-chamado"><Plus className="size-4" aria-hidden /> Novo chamado</Link>}
          </>
        }
      />
      <form className="panel flex flex-wrap items-end gap-3 p-3" role="search">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Busca</span>
          <span className="relative block">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={filters.q} className="input py-1.5 pl-9" placeholder="Assunto, descrição ou e-mail" />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Status</span>
          <select name="status" defaultValue={filters.status ?? "ACTIVE"} className="input py-1.5">
            <option value="ACTIVE">Em aberto</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Prioridade</span>
          <select name="priority" defaultValue={filters.priority ?? ""} className="input py-1.5">
            <option value="">Todas</option>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Categoria</span>
          <select name="category" defaultValue={filters.category ?? ""} className="input py-1.5">
            <option value="">Todas</option>
            {team.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" name="mine" value="1" defaultChecked={Boolean(filters.mine)} /> Só os meus
        </label>
        <button className="btn-primary py-1.5"><SlidersHorizontal className="size-4" aria-hidden /> Filtrar</button>
      </form>

      {tickets.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title="Nenhum chamado com esses filtros"
            action={<Link href="/chamados" className="btn">Limpar filtros</Link>}
          >
            Tente outro termo de busca ou remova algum filtro.
          </EmptyState>
        ) : (
          <EmptyState icon={<Inbox className="size-5" />} title="Fila em dia: nenhum chamado em aberto">
            Novos chamados chegam pelo portal, e-mail, chat, Slack ou webhook e aparecem aqui assim que forem abertos.
          </EmptyState>
        )
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Chamado</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Categoria</th>
                <th>Responsável</th>
                <th>Canal</th>
                <th>Aberto em</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="relative">
                  <td>
                    <Link href={`/chamados/${t.id}`} className="font-medium text-slate-900 underline-offset-4 after:absolute after:inset-0 hover:text-brand-700 dark:text-slate-100 dark:hover:text-brand-300">{t.title}</Link>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t.requesterName ?? t.requesterEmail}</span>
                  </td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td>{t.category ?? "—"}{t.triagedByAgent && <span className="badge ml-1.5 bg-brand-50 px-1 py-0 text-[10px] text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" title="Definida pelo agente de triagem">IA</span>}</td>
                  <td>{t.card?.assignee?.name ?? "—"}</td>
                  <td>{CHANNEL_LABELS[t.channel]}</td>
                  <td className="whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} total={total} noun={["chamado", "chamados"]} href={(p) => pageHref("/chamados", raw, p)} />
    </main>
  );
}
