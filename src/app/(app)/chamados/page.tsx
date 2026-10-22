import Link from "next/link";
import { requireUser } from "@/lib/session";
import { CHANNEL_LABELS, listTickets, PRIORITY_LABELS, STATUS_LABELS, ticketFiltersSchema } from "@/lib/tickets";
import { db } from "@/lib/db";
import { PriorityBadge, StatusBadge, formatDateTime } from "@/components/tickets/badges";

export const metadata = { title: "Chamados" };

export default async function TicketsPage({ searchParams }: PageProps<"/chamados">) {
  const user = await requireUser("board:view");
  const raw = await searchParams;
  const parsed = ticketFiltersSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined])));
  const filters = parsed.success ? parsed.data : {};
  const [tickets, team] = await Promise.all([
    listTickets(user, { status: "ACTIVE", ...filters }),
    db.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { categories: true } }),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Chamados</h1>
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="space-y-1">
          <span className="block text-xs font-medium">Busca</span>
          <input name="q" defaultValue={filters.q} className="input w-56 py-1" placeholder="Assunto, descrição ou e-mail" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Status</span>
          <select name="status" defaultValue={filters.status ?? "ACTIVE"} className="input py-1">
            <option value="ACTIVE">Em aberto</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Prioridade</span>
          <select name="priority" defaultValue={filters.priority ?? ""} className="input py-1">
            <option value="">Todas</option>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Categoria</span>
          <select name="category" defaultValue={filters.category ?? ""} className="input py-1">
            <option value="">Todas</option>
            {team.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 pb-1.5 text-sm">
          <input type="checkbox" name="mine" value="1" defaultChecked={Boolean(filters.mine)} /> Só os meus
        </label>
        <button className="btn">Filtrar</button>
      </form>

      {tickets.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">Nenhum chamado encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="p-2 font-medium">Chamado</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Prioridade</th>
                <th className="p-2 font-medium">Categoria</th>
                <th className="p-2 font-medium">Responsável</th>
                <th className="p-2 font-medium">Canal</th>
                <th className="p-2 font-medium">Aberto em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="p-2">
                    <Link href={`/chamados/${t.id}`} className="font-medium underline-offset-2 hover:underline">{t.title}</Link>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t.requesterName ?? t.requesterEmail}</span>
                  </td>
                  <td className="p-2"><StatusBadge status={t.status} /></td>
                  <td className="p-2"><PriorityBadge priority={t.priority} /></td>
                  <td className="p-2">{t.category ?? "—"}{t.triagedByAgent && <span className="ml-1 text-xs text-slate-500" title="Definida pelo agente de triagem">(IA)</span>}</td>
                  <td className="p-2">{t.card?.assignee?.name ?? "—"}</td>
                  <td className="p-2">{CHANNEL_LABELS[t.channel]}</td>
                  <td className="p-2 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
