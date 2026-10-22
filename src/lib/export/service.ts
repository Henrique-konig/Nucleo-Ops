import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { NotFoundError, type Actor } from "@/lib/errors";
import { CHANNEL_LABELS, PRIORITY_LABELS, STATUS_LABELS, ticketWhere, type ticketFiltersSchema } from "@/lib/tickets";
import { toCsv } from "./csv";
import { renderTablePdf, renderTextPdf } from "./pdf";

// Exportações em CSV e PDF. Toda exportação fica registrada na auditoria.

const MAX_TICKETS = 5_000;

const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

type TicketFilters = z.infer<typeof ticketFiltersSchema>;

/** Descrição legível dos filtros, para o cabeçalho do PDF. */
function describeTicketFilters(f: TicketFilters): string {
  const parts = [
    f.status === "ACTIVE" || !f.status ? "em aberto" : STATUS_LABELS[f.status],
    f.priority && `prioridade ${PRIORITY_LABELS[f.priority].toLowerCase()}`,
    f.category && `categoria ${f.category}`,
    f.mine && "só os meus",
    f.q && `busca "${f.q}"`,
  ].filter(Boolean);
  return parts.join(" · ");
}

async function loadTickets(actor: Actor, filters: TicketFilters) {
  assertCan(actor.role, "board:view");
  assertCan(actor.role, "ticket:export");
  return db.ticket.findMany({
    where: ticketWhere(actor, filters),
    select: {
      id: true, title: true, status: true, priority: true, category: true, channel: true,
      requesterName: true, requesterEmail: true, satisfaction: true,
      createdAt: true, firstResponseAt: true, resolvedAt: true, resolvedByAgent: true,
      requester: { select: { name: true, email: true } },
      card: { select: { assignee: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_TICKETS,
  });
}

export async function exportTickets(actor: Actor, filters: TicketFilters, format: "csv"): Promise<string>;
export async function exportTickets(actor: Actor, filters: TicketFilters, format: "pdf"): Promise<Uint8Array>;
export async function exportTickets(actor: Actor, filters: TicketFilters, format: "csv" | "pdf"): Promise<string | Uint8Array> {
  const tickets = await loadTickets(actor, filters);
  await db.$transaction((tx) =>
    recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "ticket.export", targetType: "team", targetId: actor.teamId,
      payload: { format, filters, count: tickets.length },
    }),
  );
  const requester = (t: (typeof tickets)[number]) => t.requester?.name ?? t.requesterName ?? t.requester?.email ?? t.requesterEmail ?? "";

  if (format === "csv") {
    return toCsv(
      ["id", "titulo", "status", "prioridade", "categoria", "canal", "solicitante", "email_solicitante", "responsavel", "aberto_em", "primeira_resposta_em", "resolvido_em", "resolvido_por_agente", "satisfacao"],
      tickets.map((t) => [
        t.id, t.title, STATUS_LABELS[t.status], PRIORITY_LABELS[t.priority], t.category, CHANNEL_LABELS[t.channel],
        requester(t), t.requester?.email ?? t.requesterEmail, t.card?.assignee?.name,
        t.createdAt, t.firstResponseAt, t.resolvedAt, t.resolvedByAgent ? "sim" : "não", t.satisfaction,
      ]),
    );
  }

  return renderTablePdf({
    title: "Chamados",
    subtitle: `${tickets.length} ${tickets.length === 1 ? "chamado" : "chamados"} · ${describeTicketFilters(filters)}${tickets.length === MAX_TICKETS ? ` · limitado aos ${MAX_TICKETS} mais recentes` : ""}`,
    columns: [
      { header: "Nº", width: 8.5 },
      { header: "Chamado", width: 28.5 },
      { header: "Status", width: 10 },
      { header: "Prioridade", width: 8 },
      { header: "Categoria", width: 10 },
      { header: "Solicitante", width: 15 },
      { header: "Responsável", width: 13 },
      { header: "Aberto em", width: 11 },
      { header: "Resolvido em", width: 11 },
    ],
    rows: tickets.map((t) => [
      `#${t.id.slice(-8)}`, t.title, STATUS_LABELS[t.status], PRIORITY_LABELS[t.priority], t.category ?? "",
      requester(t), t.card?.assignee?.name ?? "", fmtDateTime(t.createdAt), fmtDateTime(t.resolvedAt),
    ]),
  });
}

export async function exportReportPdf(actor: Actor, reportId: string) {
  assertCan(actor.role, "metrics:view");
  const report = await db.report.findFirst({ where: { id: reportId, teamId: actor.teamId } });
  if (!report) throw new NotFoundError("Relatório");
  await db.$transaction((tx) =>
    recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "report.export", targetType: "report", targetId: report.id, payload: { format: "pdf" } }),
  );
  const range = report.period === "DAILY" ? fmtDate(report.periodStart) : `${fmtDate(report.periodStart)} a ${fmtDate(new Date(report.periodEnd.getTime() - 1))}`;
  const bytes = await renderTextPdf({
    title: `Relatório ${report.period === "DAILY" ? "diário" : "semanal"}`,
    subtitle: range,
    markdown: report.content,
  });
  return { bytes, filename: `relatorio-${report.period === "DAILY" ? "diario" : "semanal"}-${report.periodStart.toISOString().slice(0, 10)}.pdf` };
}
