import { z } from "zod";
import { normalize as fold } from "@/lib/ai/text";

// Filtros do quadro. Rodam no navegador sobre os cartões já carregados (resposta
// imediata) e podem ser salvos com um nome, por pessoa ou para a equipe.

export const boardFilterSchema = z.object({
  text: z.string().trim().max(200).optional(),
  // "me", "none" ou o id de um membro.
  assigneeId: z.string().max(64).optional(),
  labelId: z.string().max(64).optional(),
  // Prioridade do chamado; "NONE" = cartão sem chamado.
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT", "NONE"]).optional(),
  // "any", "none" ou o id de um agente.
  agentId: z.string().max(64).optional(),
  due: z.enum(["overdue", "week", "none"]).optional(),
});

export type BoardFilter = z.infer<typeof boardFilterSchema>;

export type FilterableCard = {
  title: string;
  description: string | null;
  dueDate: Date | string | null;
  assignee: { id: string } | null;
  agent?: { id: string } | null;
  labels: { id: string; name: string }[];
  ticket: { priority: string } | null;
};

/** Remove campos vazios, para comparar e salvar só o que importa. */
export function cleanFilter(filter: BoardFilter): BoardFilter {
  return Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== "")) as BoardFilter;
}

export function isFilterActive(filter: BoardFilter) {
  return Object.keys(cleanFilter(filter)).length > 0;
}

export function sameFilter(a: BoardFilter, b: BoardFilter) {
  const x = cleanFilter(a);
  const y = cleanFilter(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]) as Set<keyof BoardFilter>;
  return [...keys].every((k) => x[k] === y[k]);
}

export function matchesFilter(card: FilterableCard, filter: BoardFilter, ctx: { userId: string; now?: Date }): boolean {
  const f = cleanFilter(filter);
  if (f.text) {
    const haystack = fold(`${card.title} ${card.description ?? ""} ${card.labels.map((l) => l.name).join(" ")}`);
    if (!fold(f.text).split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  if (f.assigneeId) {
    const id = card.assignee?.id ?? null;
    if (f.assigneeId === "none" ? id !== null : id !== (f.assigneeId === "me" ? ctx.userId : f.assigneeId)) return false;
  }
  if (f.labelId && !card.labels.some((l) => l.id === f.labelId)) return false;
  if (f.priority) {
    const priority = card.ticket?.priority ?? "NONE";
    if (priority !== f.priority) return false;
  }
  if (f.agentId) {
    const id = card.agent?.id ?? null;
    if (f.agentId === "none" ? id !== null : f.agentId === "any" ? id === null : id !== f.agentId) return false;
  }
  if (f.due) {
    const due = card.dueDate ? new Date(card.dueDate) : null;
    const now = ctx.now ?? new Date();
    // Prazos são gravados à meia-noite UTC: compara pelo dia.
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (f.due === "none" && due) return false;
    if (f.due === "overdue" && !(due && due < today)) return false;
    if (f.due === "week" && !(due && due >= today && due.getTime() <= today.getTime() + 7 * 86_400_000)) return false;
  }
  return true;
}
