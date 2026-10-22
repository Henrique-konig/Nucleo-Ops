import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { CHANNEL_LABELS, getTicketForStaff, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/tickets";
import { NotFoundError } from "@/lib/errors";
import { db } from "@/lib/db";
import { PriorityBadge, StatusBadge, formatDateTime } from "@/components/tickets/badges";
import { TicketThread } from "@/components/tickets/thread";
import { ActionForm } from "@/components/tickets/action-form";
import { changeFields, changeStatus, reply } from "../actions";

export const metadata = { title: "Chamado" };

export default async function StaffTicketPage({ params }: PageProps<"/chamados/[ticketId]">) {
  const user = await requireUser("board:view");
  const { ticketId } = await params;
  const ticket = await getTicketForStaff(user, ticketId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const team = await db.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { categories: true } });
  const canEdit = can(user.role, "card:edit");
  const canPrioritize = can(user.role, "card:prioritize");

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{ticket.title}</h1>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            #{ticket.id.slice(-8)} · {CHANNEL_LABELS[ticket.channel]} · {ticket.requesterName ?? ticket.requesterEmail} · aberto em {formatDateTime(ticket.createdAt)}
          </p>
        </header>

        <TicketThread messages={ticket.messages} requesterId={ticket.requesterId} />

        {canEdit && (
          <ActionForm action={reply.bind(null, ticket.id)} className="space-y-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Responder</span>
              <textarea name="content" required rows={4} className="input" />
            </label>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="internal" /> Nota interna (não vai para o solicitante)
              </label>
              <button className="btn-primary">Enviar</button>
            </div>
          </ActionForm>
        )}
      </div>

      <aside className="space-y-4">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Detalhes</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Responsável</dt>
            <dd>{ticket.card?.assignee?.name ?? "—"}</dd>
            <dt className="text-slate-500">Coluna</dt>
            <dd>{ticket.card ? <Link className="underline" href={`/boards/${ticket.card.boardId}`}>{ticket.card.column.name}</Link> : "—"}</dd>
            <dt className="text-slate-500">Categoria</dt>
            <dd>{ticket.category ?? "—"}</dd>
            <dt className="text-slate-500">1ª resposta</dt>
            <dd>{ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : "—"}</dd>
            {ticket.satisfaction && (<><dt className="text-slate-500">Avaliação</dt><dd>{ticket.satisfaction} de 5</dd></>)}
          </dl>
        </section>

        {can(user.role, "card:move") && (
          <ActionForm key={ticket.status} action={changeStatus.bind(null, ticket.id)} resetOnSuccess={false} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Status</span>
              <select name="status" defaultValue={ticket.status} className="input">
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <button className="btn">Atualizar status</button>
          </ActionForm>
        )}

        {canPrioritize && (
          <ActionForm key={`${ticket.priority}-${ticket.category}`} action={changeFields.bind(null, ticket.id)} resetOnSuccess={false} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Prioridade</span>
              <select name="priority" defaultValue={ticket.priority} className="input">
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Categoria</span>
              <select name="category" defaultValue={ticket.category ?? ""} className="input">
                <option value="">Sem categoria</option>
                {team.categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <button className="btn">Salvar</button>
          </ActionForm>
        )}
      </aside>
    </main>
  );
}
