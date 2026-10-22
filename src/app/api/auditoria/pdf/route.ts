import { exportAudit } from "@/lib/export/audit-route";

export const runtime = "nodejs";

export function GET(request: Request) {
  return exportAudit(request, "pdf");
}
