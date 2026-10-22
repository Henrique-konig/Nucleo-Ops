import type { TicketMessage } from "@/lib/tickets";
import { formatDateTime } from "./badges";

const AGENT_NAMES = { TRIAGE: "Agente de triagem", RESEARCH: "Agente de pesquisa", EXECUTION: "Agente de execução", SUMMARY: "Agente de resumo" } as const;

function authorOf(m: TicketMessage, requesterId: string | null) {
  if (m.agent) return { name: AGENT_NAMES[m.agent.type] ?? "Assistente", kind: "agent" as const };
  if (m.author) return { name: m.author.name, kind: m.author.id === requesterId ? ("requester" as const) : ("staff" as const) };
  if (m.authorEmail) return { name: m.authorEmail, kind: "requester" as const };
  return { name: "Plantão", kind: "system" as const };
}

/** Conversa do chamado. A equipe vê também as notas internas. */
export function TicketThread({ messages, requesterId }: { messages: TicketMessage[]; requesterId: string | null }) {
  return (
    <ol className="space-y-3" aria-label="Mensagens do chamado">
      {messages.map((m) => {
        const author = authorOf(m, requesterId);
        if (author.kind === "system") {
          return (
            <li key={m.id} className="text-center text-xs text-slate-500 dark:text-slate-400">
              {m.content} · {formatDateTime(m.createdAt)}
            </li>
          );
        }
        const style = m.internal
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
          : author.kind === "requester"
            ? "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            : "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950";
        return (
          <li key={m.id} className={`rounded-lg border p-3 ${style}`}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {author.name}
                {m.internal && <span className="ml-2 rounded bg-amber-200 px-1 text-amber-900 dark:bg-amber-800 dark:text-amber-100">Nota interna</span>}
              </span>
              <time dateTime={new Date(m.createdAt).toISOString()}>{formatDateTime(m.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap text-sm">{m.content}</p>
          </li>
        );
      })}
    </ol>
  );
}
