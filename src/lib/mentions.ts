// Menções em comentários: o texto guarda @[Nome](userId), para que o nome mostrado
// sobreviva a renomeações e o id permita notificar a pessoa certa.

const MENTION = /@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;

export type Segment = { type: "text"; text: string } | { type: "mention"; name: string; userId: string };

export function mentionToken(name: string, userId: string) {
  return `@[${name.replace(/[[\]\n]/g, "")}](${userId})`;
}

/** Ids mencionados, sem repetição e na ordem em que aparecem. */
export function parseMentions(content: string): string[] {
  return [...new Set([...content.matchAll(MENTION)].map((m) => m[2]))];
}

/** Divide o texto em trechos simples e menções, para exibir sem HTML cru. */
export function segments(content: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of content.matchAll(MENTION)) {
    if (m.index > last) out.push({ type: "text", text: content.slice(last, m.index) });
    out.push({ type: "mention", name: m[1], userId: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ type: "text", text: content.slice(last) });
  return out;
}

/** Texto corrido, com as menções como @Nome (notificações, prévias). */
export function plainText(content: string, max = 140) {
  const text = content.replace(MENTION, "@$1").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Consulta de menção em andamento antes do cursor: "@ana" → "ana".
 * Retorna null quando o cursor não está numa menção sendo digitada.
 */
export function mentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = /(^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(before);
  if (!match) return null;
  return { start: cursor - match[2].length - 1, query: match[2] };
}
