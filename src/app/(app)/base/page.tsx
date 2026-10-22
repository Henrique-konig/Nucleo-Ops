import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listDocuments } from "@/lib/knowledge";
import { formatDateTime } from "@/components/tickets/badges";

export const metadata = { title: "Base de conhecimento" };

export default async function KnowledgePage({ searchParams }: PageProps<"/base">) {
  const user = await requireUser("board:view");
  const { q, vencidos } = await searchParams;
  const docs = await listDocuments(user, { q: typeof q === "string" ? q : undefined, expired: vencidos === "1" });
  const now = new Date();

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Base de conhecimento</h1>
        {can(user.role, "kb:edit") && <Link href="/base/novo" className="btn-primary">Novo documento</Link>}
      </div>
      <form role="search" className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="kb-q">Buscar</label>
        <input id="kb-q" name="q" defaultValue={typeof q === "string" ? q : ""} placeholder="Buscar por título ou conteúdo" className="input w-72 py-1" />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="vencidos" value="1" defaultChecked={vencidos === "1"} /> Só vencidos</label>
        <button className="btn">Buscar</button>
      </form>
      {docs.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">Nenhum documento. Os agentes só respondem tão bem quanto a base.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {docs.map((d) => {
            const expired = d.validUntil && d.validUntil < now;
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                <Link href={`/base/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {expired ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-900 dark:bg-red-900 dark:text-red-100">Vencido — revisar</span> : `Atualizado em ${formatDateTime(d.updatedAt)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
