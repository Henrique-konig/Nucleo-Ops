import { Bot, History } from "lucide-react";
import type { ActivityItem } from "@/lib/collaboration";
import { initials } from "@/lib/initials";

export function relativeTime(date: Date | string, now = Date.now()) {
  const diff = Math.round((now - new Date(date).getTime()) / 1000);
  if (diff < 45) return "agora";
  if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
  if (diff < 86_400) return `há ${Math.round(diff / 3600)} h`;
  if (diff < 7 * 86_400) return `há ${Math.round(diff / 86_400)} d`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Linha do tempo do cartão ou do chamado, da mais recente para a mais antiga. */
export function ActivityFeed({ items, emptyText = "Nenhuma atividade ainda." }: { items: ActivityItem[]; emptyText?: string }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-800">
        <History className="size-4" aria-hidden /> {emptyText}
      </p>
    );
  }
  return (
    <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3 text-sm">
          <span
            aria-hidden
            className={`z-10 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ring-4 ring-white dark:ring-slate-900 ${
              a.kind === "agent" ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            {a.kind === "agent" ? <Bot className="size-3.5" /> : initials(a.who)}
          </span>
          <p className="min-w-0 pt-0.5 text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">{a.who}</span> {a.text}
            <time dateTime={new Date(a.at).toISOString()} title={new Date(a.at).toLocaleString("pt-BR")} className="ml-1.5 text-xs text-slate-400">
              {relativeTime(a.at)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  );
}
