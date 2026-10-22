import { segments } from "@/lib/mentions";

/** Comentário com as menções destacadas (sem HTML cru: tudo vira texto). */
export function RichText({ content, currentUserId }: { content: string; currentUserId?: string }) {
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-700 dark:text-slate-200">
      {segments(content).map((s, i) =>
        s.type === "text" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span
            key={i}
            className={`rounded px-1 font-medium ${s.userId === currentUserId ? "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100" : "bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-200"}`}
          >
            @{s.name}
          </span>
        ),
      )}
    </p>
  );
}
