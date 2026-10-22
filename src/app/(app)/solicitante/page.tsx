import Link from "next/link";
import { ChevronRight, Inbox, PlusCircle } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/session";
import { listRequesterTickets } from "@/lib/tickets";
import { db } from "@/lib/db";
import { StatusBadge, formatDateTime } from "@/components/tickets/badges";
import { ActionForm } from "@/components/tickets/action-form";
import { chatHuman, chatResolve, chatSend, openTicket } from "./actions";
import { getActiveConversation } from "@/lib/chatbot";
import { ChatWidget } from "@/components/chat/chat-widget";

export const metadata = { title: "Meus chamados" };

export default async function RequesterPage() {
  const user = await requireUser("ticket:create");
  const [tickets, team, conversation] = await Promise.all([
    listRequesterTickets(user.id),
    db.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { categories: true } }),
    getActiveConversation(user),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} description="Converse com o assistente, abra um chamado ou acompanhe os que já estão em andamento." />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
      <ChatWidget
        conversationId={conversation?.id ?? null}
        messages={(conversation?.messages ?? []).map((m) => ({ id: m.id, content: m.content, fromAssistant: Boolean(m.agentId), system: !m.agentId && !m.authorId }))}
        send={chatSend}
        resolve={conversation ? chatResolve.bind(null, conversation.id) : undefined}
        human={conversation ? chatHuman.bind(null, conversation.id) : undefined}
      />
      <section aria-labelledby="my-tickets">
        <h2 id="my-tickets" className="section-title mb-3">Meus chamados</h2>
        {tickets.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="Você ainda não abriu chamados">
            Quando abrir, eles aparecem aqui com o status atualizado.
          </EmptyState>
        ) : (
          <ul className="panel divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/solicitante/chamados/${t.id}`} className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span>
                    <span className="block font-medium">{t.title}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Aberto em {formatDateTime(t.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    <ChevronRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>

      <section aria-labelledby="new-ticket" className="panel h-fit animate-rise p-5 lg:sticky lg:top-8">
        <h2 id="new-ticket" className="section-title mb-4 flex items-center gap-2"><PlusCircle className="size-4 text-brand-500" aria-hidden /> Abrir chamado</h2>
        <ActionForm action={openTicket} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="field-label">Assunto</span>
            <input name="title" required minLength={3} maxLength={200} className="input" />
          </label>
          <label className="block space-y-1.5">
            <span className="field-label">Categoria (opcional)</span>
            <select name="category" className="input" defaultValue="">
              <option value="">Não sei</option>
              {team.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="field-label">Descrição</span>
            <textarea name="description" required minLength={5} rows={5} className="input" placeholder="O que aconteceu? Desde quando? Alguma mensagem de erro?" />
          </label>
          <button className="btn-primary w-full">Abrir chamado</button>
        </ActionForm>
      </section>
      </div>
    </main>
  );
}
