import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listRequesterTickets } from "@/lib/tickets";
import { db } from "@/lib/db";
import { StatusBadge, formatDateTime } from "@/components/tickets/badges";
import { ActionForm } from "@/components/tickets/action-form";
import { openTicket } from "./actions";

export const metadata = { title: "Meus chamados" };

export default async function RequesterPage() {
  const user = await requireUser("ticket:create");
  const [tickets, team] = await Promise.all([
    listRequesterTickets(user.id),
    db.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { categories: true } }),
  ]);

  return (
    <main className="mx-auto grid max-w-5xl gap-8 p-6 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="my-tickets">
        <h1 id="my-tickets" className="mb-4 text-xl font-semibold">Meus chamados</h1>
        {tickets.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400">Você ainda não abriu chamados.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/solicitante/chamados/${t.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span>
                    <span className="block font-medium">{t.title}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Aberto em {formatDateTime(t.createdAt)}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-ticket" className="h-fit rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="new-ticket" className="mb-3 font-semibold">Abrir chamado</h2>
        <ActionForm action={openTicket} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Assunto</span>
            <input name="title" required minLength={3} maxLength={200} className="input" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Categoria (opcional)</span>
            <select name="category" className="input" defaultValue="">
              <option value="">Não sei</option>
              {team.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Descrição</span>
            <textarea name="description" required minLength={5} rows={5} className="input" placeholder="O que aconteceu? Desde quando? Alguma mensagem de erro?" />
          </label>
          <button className="btn-primary w-full">Abrir chamado</button>
        </ActionForm>
      </section>
    </main>
  );
}
