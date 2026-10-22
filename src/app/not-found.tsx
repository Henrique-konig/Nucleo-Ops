import Link from "next/link";
import { SearchX } from "lucide-react";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4 py-16">
      <div className="panel w-full max-w-md animate-rise space-y-4 p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
          <SearchX className="size-6" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Não encontramos esta página</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            O endereço pode estar errado, ou o item foi arquivado ou excluído. Se alguém enviou o link, confira se você tem acesso a ele.
          </p>
        </div>
        <Link href="/" className="btn-primary">Ir para o início</Link>
      </div>
    </main>
  );
}
