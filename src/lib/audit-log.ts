import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import type { Actor } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { actionLabel, TARGET_LABELS } from "@/lib/audit-labels";
import { AGENT_LABELS } from "@/lib/admin";
import { toCsv } from "@/lib/export/csv";
import { renderTablePdf } from "@/lib/export/pdf";

// Consulta do log de auditoria (somente leitura): quem ou qual agente fez o quê.

export const auditFiltersSchema = z.object({
  actor: z.enum(["user", "agent"]).optional(),
  // Pessoa específica (id do usuário).
  user: z.string().max(64).optional(),
  type: z.string().max(60).optional(),
  targetType: z.string().max(40).optional(),
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
    ...(f.user && { userId: f.user }),
    ...(f.type && { type: { startsWith: f.type } }),
    ...(f.targetType && { targetType: f.targetType }),
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

/** Pessoas que aparecem no filtro "Quem" (toda a equipe, inclusive desativados). */
export async function auditPeople(actor: Actor) {
  assertCan(actor.role, "audit:view");
  return db.user.findMany({ where: { teamId: actor.teamId }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } });
}

const MAX_EXPORT = 50_000;
const MAX_PDF = 5_000;

type AuditRow = Prisma.ActionGetPayload<{ include: typeof include }>;

const who = (r: AuditRow) => (r.user ? r.user.name : `Agente ${r.agent ? AGENT_LABELS[r.agent.type] : ""}`);

export async function exportAuditCsv(actor: Actor, filters: AuditFilters) {
  assertCan(actor.role, "audit:view");
  const rows = await db.action.findMany({ where: where(actor, filters), include, orderBy: { createdAt: "desc" }, take: MAX_EXPORT });
  return toCsv(
    ["data", "autor", "tipo_autor", "acao", "descricao", "alvo", "id_alvo", "confirmado_por", "detalhes", "resultado"],
    rows.map((r) => [
      r.createdAt.toISOString(),
      r.user ? `${r.user.name} <${r.user.email}>` : `agente ${r.agent?.type}`,
      r.userId ? "usuario" : "agente",
      r.type,
      actionLabel(r.type),
      r.targetType,
      r.targetId,
      r.confirmedBy?.name,
      r.payload,
      r.result,
    ]),
  );
}

export async function exportAuditPdf(actor: Actor, filters: AuditFilters) {
  assertCan(actor.role, "audit:view");
  const rows = await db.action.findMany({ where: where(actor, filters), include, orderBy: { createdAt: "desc" }, take: MAX_PDF });
  const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
  const period = filters.from || filters.to
    ? `de ${filters.from ? filters.from.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "início"} até ${filters.to ? filters.to.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "hoje"}`
    : "todo o período";
  return renderTablePdf({
    title: "Log de auditoria",
    subtitle: `${rows.length} registros · ${period}${rows.length === MAX_PDF ? ` · limitado aos ${MAX_PDF} mais recentes (use o CSV para tudo)` : ""}`,
    columns: [
      { header: "Quando", width: 12 },
      { header: "Quem", width: 15 },
      { header: "Ação", width: 20 },
      { header: "Alvo", width: 14 },
      { header: "Detalhes", width: 39 },
    ],
    maxCellLines: 4,
    rows: rows.map((r) => [
      fmt(r.createdAt),
      `${who(r)}${r.confirmedBy ? ` (confirmado por ${r.confirmedBy.name})` : ""}`,
      `${actionLabel(r.type)}\n${r.type}`,
      `${TARGET_LABELS[r.targetType] ?? r.targetType} ${r.targetId.slice(-10)}`,
      [r.payload != null ? JSON.stringify(r.payload) : "", r.result != null ? `-> ${JSON.stringify(r.result)}` : ""].filter(Boolean).join("\n"),
    ]),
  });
}
