import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { subscribeToBoard } from "@/lib/realtime";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Em serverless a conexão é encerrada no limite da função; o EventSource reconecta sozinho.
export const maxDuration = 300;

export async function GET(request: Request, ctx: RouteContext<"/api/boards/[boardId]/events">) {
  const { boardId } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "board:view")) return new Response("Sem permissão", { status: 403 });

  const board = await db.board.findFirst({ where: { id: boardId, teamId: user.teamId }, select: { id: true } });
  if (!board) return new Response("Quadro não encontrado", { status: 404 });

  return sseResponse(request, (onChange) => subscribeToBoard(boardId, onChange));
}
