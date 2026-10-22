import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { auditFiltersSchema, exportAuditCsv } from "@/lib/audit-log";
import { recordAction } from "@/lib/audit";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "audit:view")) return new Response("Sem permissão", { status: 403 });
  const params = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v));
  const filters = auditFiltersSchema.parse(params);
  const csv = await exportAuditCsv(user, filters);
  // Exportar o log também fica registrado.
  await db.$transaction((tx) => recordAction(tx, { teamId: user.teamId, userId: user.id, type: "audit.export", targetType: "team", targetId: user.teamId, payload: params }));
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
