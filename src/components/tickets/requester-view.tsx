import type { getTicketForRequester } from "@/lib/tickets";
import { StatusBadge, formatDateTime } from "./badges";
import { TicketThread } from "./thread";
import { ActionForm } from "./action-form";
import { RatingForm } from "./rating";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

/** Página do chamado para o solicitante (portal e link de acompanhamento). */
export function RequesterTicketView({
  ticket,
  sendMessage,
  rate,
}: {
  ticket: Awaited<ReturnType<typeof getTicketForRequester>>;
  sendMessage: (fd: FormData) => Promise<Result>;
  rate: (fd: FormData) => Promise<Result>;
}) {
  const resolved = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{ticket.title}</h1>
          <StatusBadge status={ticket.status} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Chamado #{ticket.id.slice(-8)} · aberto em {formatDateTime(ticket.createdAt)}
          {ticket.card?.assignee && <> · com {ticket.card.assignee.name}</>}
        </p>
      </header>

      <TicketThread messages={ticket.messages} requesterId={ticket.requesterId} />

      {resolved && <RatingForm current={ticket.satisfaction} action={rate} />}

      <ActionForm action={sendMessage} className="space-y-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{resolved ? "O problema voltou? Escreva aqui para reabrir" : "Responder"}</span>
          <textarea name="content" required rows={3} className="input" />
        </label>
        <button className="btn-primary">Enviar</button>
      </ActionForm>
    </main>
  );
}
