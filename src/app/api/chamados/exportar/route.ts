import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ticketFiltersSchema } from "@/lib/tickets";
import { exportTickets } from "@/lib/export/service";
import { csvResponse, exportFilename } from "@/lib/export/csv";
import { pdfResponse } from "@/lib/export/pdf";

export const runtime = "nodejs";

/** Exporta a lista de chamados com os mesmos filtros da tela: ?formato=csv|pdf */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "board:view") || !can(user.role, "ticket:export")) return new Response("Sem permissão", { status: 403 });
  const { formato, ...params } = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v));
  const format = formato === "pdf" ? "pdf" : "csv";
  const parsed = ticketFiltersSchema.safeParse(params);
  if (!parsed.success) return new Response("Filtros inválidos", { status: 400 });
  // A tela mostra os chamados em aberto quando nenhum status é escolhido.
  const filters = { status: "ACTIVE" as const, ...parsed.data };
  if (format === "pdf") return pdfResponse(await exportTickets(user, filters, "pdf"), exportFilename("chamados", "pdf"));
  return csvResponse(await exportTickets(user, filters, "csv"), exportFilename("chamados", "csv"));
}
