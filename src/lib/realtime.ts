import "server-only";
import { Client } from "pg";

// Tempo real sem serviço externo: triggers no banco fazem pg_notify('plantao_board', boardId)
// a cada mudança em cartões, colunas e checklists, e cada instância do servidor mantém
// uma única conexão LISTEN que repassa os avisos aos navegadores conectados por SSE.
// LISTEN exige conexão direta — no Neon, DIRECT_URL (sem -pooler).

type Listener = (boardId: string) => void;

const CHANNEL = "plantao_board";

const state = globalThis as unknown as {
  realtimeListeners?: Set<Listener>;
  realtimeClient?: Promise<Client> | null;
};
state.realtimeListeners ??= new Set();
const listeners = state.realtimeListeners;

function connect(): Promise<Client> {
  state.realtimeClient ??= (async () => {
    const client = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
    const reset = () => {
      state.realtimeClient = null;
      client.end().catch(() => {});
    };
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      for (const listener of listeners) listener(msg.payload);
    });
    client.on("error", reset);
    client.on("end", () => (state.realtimeClient = null));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
    } catch (err) {
      reset();
      throw err;
    }
    return client;
  })();
  return state.realtimeClient;
}

/** Inscreve um ouvinte para mudanças de um quadro. Retorna a função para cancelar. */
export async function subscribeToBoard(boardId: string, onChange: () => void): Promise<() => void> {
  const listener: Listener = (id) => {
    if (id === boardId) onChange();
  };
  listeners.add(listener);
  try {
    await connect();
  } catch (err) {
    listeners.delete(listener);
    throw err;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      const pending = state.realtimeClient;
      state.realtimeClient = null;
      pending?.then((c) => c.end()).catch(() => {});
    }
  };
}
