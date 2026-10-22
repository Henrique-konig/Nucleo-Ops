import type { TicketMessage } from "@/lib/tickets";
import { Sparkles } from "lucide-react";
import { initials } from "@/lib/initials";
import { formatDateTime } from "./badges";

const AGENT_NAMES = { TRIAGE: "Agente de triagem", RESEARCH: "Agente de pesquisa", EXECUTION: "Agente de execução", SUMMARY: "Agente de resumo", CHATBOT: "Assistente" } as const;

function authorOf(m: TicketMessage, requesterId: string | null) {
  if (m.agent) return { name: AGENT_NAMES[m.agent.type] ?? "Assistente", kind: "agent" as const };
  if (m.author) return { name: m.author.name, kind: m.author.id === requesterId ? ("requester" as const) : ("staff" as const) };
  if (m.authorEmail) return { name: m.authorEmail, kind: "requester" as const };
  return { name: "Plantão", kind: "system" as const };
}

/** Conversa do chamado. A equipe vê também as notas internas. */
export function TicketThread({ messages, requesterId }: { messages: TicketMessage[]; requesterId: string | null }) {
  return (
    <ol className="space-y-4" aria-label="Mensagens do chamado">
      {messages.map((m) => {
        const author = authorOf(m, requesterId);
        if (author.kind === "system") {
          return (
            <li key={m.id} className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span aria-hidden className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span className="text-center">{m.content} · {formatDateTime(m.createdAt)}</span>
              <span aria-hidden className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </li>
          );
        }
        const mine = author.kind !== "requester";
        const style = m.internal
          ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40"
          : author.kind === "requester"
            ? "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/70"
            : "border-brand-200/70 bg-brand-50/70 dark:border-brand-900/60 dark:bg-brand-950/30";
        const avatar =
          author.kind === "agent"
            ? "bg-gradient-to-br from-violet-500 to-brand-600 text-white"
            : author.kind === "staff"
              ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white"
              : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
        return (
          <li key={m.id} className={`flex animate-rise gap-3 ${mine ? "flex-row-reverse" : ""}`}>
            <span aria-hidden className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${avatar}`}>
              {author.kind === "agent" ? <Sparkles className="size-4" /> : initials(author.name)}
            </span>
            <div className={`min-w-0 max-w-[85%] rounded-2xl border px-4 py-3 shadow-card ${mine ? "rounded-tr-md" : "rounded-tl-md"} ${style}`}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {author.name}
                  {m.internal && <span className="badge ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">Nota interna</span>}
                </span>
                <time dateTime={new Date(m.createdAt).toISOString()}>{formatDateTime(m.createdAt)}</time>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">{m.content}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
