import { currentUser } from "@/lib/session";
import { subscribeToUser } from "@/lib/realtime";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Avisa o navegador quando chega (ou é lida) uma notificação da pessoa conectada. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  return sseResponse(request, (onChange) => subscribeToUser(user.id, onChange));
}
