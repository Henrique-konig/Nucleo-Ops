import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getAttachmentFile } from "@/lib/collaboration";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

/** Download do anexo. Só imagens, PDF e texto abrem no navegador; o resto é baixado. */
export async function GET(_request: Request, ctx: RouteContext<"/api/attachments/[attachmentId]">) {
  const { attachmentId } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "board:view")) return new Response("Sem permissão", { status: 403 });

  try {
    const file = await getAttachmentFile(user, attachmentId);
    const name = encodeURIComponent(file.filename);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.inline ? file.contentType : "application/octet-stream",
        "Content-Length": String(file.size),
        "Content-Disposition": `${file.inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "X-Content-Type-Options": "nosniff",
        // Impede que um arquivo enviado rode scripts no domínio do Plantão.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return new Response("Anexo não encontrado", { status: 404 });
    throw err;
  }
}
