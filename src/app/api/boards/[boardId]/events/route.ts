import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { subscribeToBoard } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Em serverless a conexão é encerrada no limite da função; o EventSource reconecta sozinho.
export const maxDuration = 300;

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request, ctx: RouteContext<"/api/boards/[boardId]/events">) {
  const { boardId } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!can(user.role, "board:view")) return new Response("Sem permissão", { status: 403 });

  const board = await db.board.findFirst({ where: { id: boardId, teamId: user.teamId }, select: { id: true } });
  if (!board) return new Response("Quadro não encontrado", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Agrupa rajadas de avisos (um movimento altera várias linhas) num único evento.
      let pending: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: () => void;
      try {
        unsubscribe = await subscribeToBoard(boardId, () => {
          pending ??= setTimeout(() => {
            pending = null;
            send(`event: change\ndata: ${Date.now()}\n\n`);
          }, 100);
        });
      } catch {
        send("event: error\ndata: indisponível\n\n");
        controller.close();
        return;
      }

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        if (pending) clearTimeout(pending);
        unsubscribe();
        cleanup = () => {};
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", () => cleanup());
      send("retry: 2000\nevent: ready\ndata: ok\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
