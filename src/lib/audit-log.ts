import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import type { Actor } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

// Consulta do log de auditoria (somente leitura): quem ou qual agente fez o quê.

export const auditFiltersSchema = z.object({
  actor: z.enum(["user", "agent"]).optional(),
  type: z.string().max(60).optional(),
  target: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

const PAGE_SIZE = 50;

function where(actor: Actor, f: AuditFilters): Prisma.ActionWhereInput {
  return {
    teamId: actor.teamId,
    ...(f.actor === "user" && { userId: { not: null } }),
    ...(f.actor === "agent" && { agentId: { not: null } }),
    ...(f.type && { type: { startsWith: f.type } }),
    ...(f.target && { targetId: f.target }),
    ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lt: new Date(f.to.getTime() + 86_400_000) }) } }),
  };
}

const include = {
  user: { select: { name: true, email: true } },
  agent: { select: { type: true } },
  confirmedBy: { select: { name: true } },
} satisfies Prisma.ActionInclude;

export async function queryAudit(actor: Actor, filters: AuditFilters) {
  assertCan(actor.role, "audit:view");
  const w = where(actor, filters);
  const [rows, total] = await Promise.all([
    db.action.findMany({ where: w, include, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.action.count({ where: w }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  // Evita fórmulas ao abrir em planilhas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportAuditCsv(actor: Actor, filters: AuditFilters) {
  assertCan(actor.role, "audit:view");
  const rows = await db.action.findMany({ where: where(actor, filters), include, orderBy: { createdAt: "desc" }, take: 50_000 });
  const header = ["data", "autor", "tipo_autor", "acao", "alvo", "id_alvo", "confirmado_por", "detalhes", "resultado"];
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.user ? `${r.user.name} <${r.user.email}>` : `agente ${r.agent?.type}`,
      r.userId ? "usuario" : "agente",
      r.type,
      r.targetType,
      r.targetId,
      r.confirmedBy?.name,
      r.payload,
      r.result,
    ].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
