import "server-only";

const HEARTBEAT_MS = 25_000;

/**
 * Resposta SSE que envia "change" a cada aviso do banco. Agrupa rajadas de avisos
 * (um movimento altera várias linhas) num único evento e mantém a conexão viva.
 */
export function sseResponse(request: Request, subscribe: (onChange: () => void) => Promise<() => void>) {
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

      let pending: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: () => void;
      try {
        unsubscribe = await subscribe(() => {
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
