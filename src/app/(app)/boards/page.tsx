import Link from "next/link";
import { ArrowRight, KanbanSquare } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { listBoards } from "@/lib/boards";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Quadros" };

export default async function BoardsPage() {
  const user = await requireUser("board:view");
  const boards = await listBoards(user);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader title="Quadros" description="Escolha um quadro para acompanhar o trabalho da equipe." />
      {boards.length === 0 ? (
        <EmptyState icon={<KanbanSquare className="size-5" />} title="Nenhum quadro ainda">
          Rode <code>npm run db:seed</code> para criar o quadro inicial.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boards.map((b, i) => (
            <li key={b.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <Link href={`/boards/${b.id}`} className="panel panel-hover group flex items-center gap-4 p-5">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-900">
                  <KanbanSquare className="size-5" aria-hidden />
                </span>
                <span className="flex-1 font-medium">{b.name}</span>
                <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
