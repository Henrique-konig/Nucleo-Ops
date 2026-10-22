import type { ReactNode } from "react";

type Block =
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "p"; text: string };

/** Negrito (**texto**), itálico (_texto_) e código (`texto`) dentro da linha. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<!\w)_[^_]+_(?!\w))/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i} className="rounded bg-slate-100 px-1 text-[0.9em] dark:bg-slate-800">{part.slice(1, -1)}</code>;
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/** Markdown simples escrito pelos agentes: títulos, listas, citações e parágrafos. Sem HTML. */
export function SimpleMarkdown({ content, className = "" }: { content: string; className?: string }) {
  const blocks: Block[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);
    if (!line.trim()) blocks.push({ kind: "p", text: "" });
    else if (/^#{1,6}\s/.test(line)) blocks.push({ kind: "h", text: line.replace(/^#+\s*/, "") });
    else if (/^>\s?/.test(line)) blocks.push({ kind: "quote", text: line.replace(/^>\s?/, "") });
    else if (/^\s*[-•*]\s/.test(line)) {
      const item = line.replace(/^\s*[-•*]\s/, "");
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (/^\s*\d+[.)]\s/.test(line)) {
      const item = line.replace(/^\s*\d+[.)]\s/, "");
      if (last?.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", items: [item] });
    } else if (last?.kind === "p" && last.text) last.text += `\n${line}`;
    else blocks.push({ kind: "p", text: line });
  }
  return (
    <div className={`space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300 ${className}`}>
      {blocks.map((b, i) =>
        b.kind === "h" ? <h4 key={i} className="pt-1 font-semibold text-slate-900 dark:text-white">{inline(b.text)}</h4>
        : b.kind === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5 marker:text-brand-500">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
        : b.kind === "ol" ? <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-slate-400">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>
        : b.kind === "quote" ? <blockquote key={i} className="border-l-2 border-slate-300 pl-3 text-slate-500 dark:border-slate-600">{inline(b.text)}</blockquote>
        : b.text ? <p key={i} className="whitespace-pre-wrap">{inline(b.text)}</p> : null,
      )}
    </div>
  );
}
