import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { exportReportPdf } from "@/lib/export/service";
import { pdfResponse } from "@/lib/export/pdf";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: RouteContext<"/api/relatorios/[reportId]/pdf">) {
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "metrics:view")) return new Response("Sem permissão", { status: 403 });
  try {
    const { bytes, filename } = await exportReportPdf(user, (await params).reportId);
    return pdfResponse(bytes, filename);
  } catch (err) {
    if (err instanceof NotFoundError) return new Response("Relatório não encontrado", { status: 404 });
    throw err;
  }
}
