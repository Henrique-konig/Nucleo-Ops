import Link from "next/link";
import { listBoards } from "@/lib/boards";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Quadros" };

export default async function BoardsPage() {
  const user = await requireUser("board:view");
  const boards = await listBoards(user);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Quadros</h1>
      {boards.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">Nenhum quadro ainda. Rode <code>npm run db:seed</code> para criar o quadro inicial.</p>
      ) : (
        <ul className="space-y-2">
          {boards.map((b) => (
            <li key={b.id}>
              <Link href={`/boards/${b.id}`} className="underline">{b.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
