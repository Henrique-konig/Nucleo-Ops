import Link from "next/link";
import { BookOpen, ChevronRight, FileText, Plus, Search } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
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
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Base de conhecimento"
        description="Os documentos que os agentes consultam para responder e sugerir soluções."
        actions={can(user.role, "kb:edit") && <Link href="/base/novo" className="btn-primary"><Plus className="size-4" aria-hidden /> Novo documento</Link>}
      />
      <form role="search" className="panel flex flex-wrap items-center gap-3 p-3">
        <label className="sr-only" htmlFor="kb-q">Buscar</label>
        <span className="relative min-w-56 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input id="kb-q" name="q" defaultValue={typeof q === "string" ? q : ""} placeholder="Buscar por título ou conteúdo" className="input py-1.5 pl-9" />
        </span>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" name="vencidos" value="1" defaultChecked={vencidos === "1"} /> Só vencidos</label>
        <button className="btn">Buscar</button>
      </form>
      {docs.length === 0 ? (
        q || vencidos === "1" ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title={q ? `Nada encontrado para “${q}”` : "Nenhum documento vencido"}
            action={<Link href="/base" className="btn">Ver todos os documentos</Link>}
          >
            {q ? "Tente outras palavras, ou escreva um documento sobre o assunto." : "Todos os documentos estão dentro da validade."}
          </EmptyState>
        ) : (
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="Nenhum documento ainda"
            action={can(user.role, "kb:edit") && <Link href="/base/novo" className="btn-primary"><Plus className="size-4" aria-hidden /> Escrever o primeiro</Link>}
          >
            Os agentes só respondem tão bem quanto a base. Comece pelos problemas que mais chegam à equipe.
          </EmptyState>
        )
      ) : (
        <ul className="panel divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {docs.map((d) => {
            const expired = d.validUntil && d.validUntil < now;
            return (
              <li key={d.id}>
                <Link href={`/base/${d.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {expired ? <span className="badge bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300">Vencido — revisar</span> : `Atualizado em ${formatDateTime(d.updatedAt)}`}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
