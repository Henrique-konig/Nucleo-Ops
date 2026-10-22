import "server-only";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { auditFiltersSchema, exportAuditCsv, exportAuditPdf } from "@/lib/audit-log";
import { recordAction } from "@/lib/audit";
import { db } from "@/lib/db";
import { csvResponse, exportFilename } from "@/lib/export/csv";
import { pdfResponse } from "@/lib/export/pdf";

/** Exportação do log de auditoria (CSV completo ou PDF), com os filtros da tela. */
export async function exportAudit(request: Request, format: "csv" | "pdf") {
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "audit:view")) return new Response("Sem permissão", { status: 403 });
  const params = Object.fromEntries([...new URL(request.url).searchParams].filter(([k, v]) => v && k !== "page"));
  const parsed = auditFiltersSchema.safeParse(params);
  if (!parsed.success) return new Response("Filtros inválidos", { status: 400 });
  // Exportar o log também fica registrado.
  await db.$transaction((tx) => recordAction(tx, { teamId: user.teamId, userId: user.id, type: "audit.export", targetType: "team", targetId: user.teamId, payload: { ...params, format } }));
  if (format === "pdf") return pdfResponse(await exportAuditPdf(user, parsed.data), exportFilename("auditoria", "pdf"));
  return csvResponse(await exportAuditCsv(user, parsed.data), exportFilename("auditoria", "csv"));
}
