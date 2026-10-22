import "server-only";
import { Client } from "pg";

// Tempo real sem serviço externo: triggers no banco fazem pg_notify('plantao_board', boardId)
// a cada mudança em cartões, colunas, checklists, comentários e anexos, e
// pg_notify('plantao_user', userId) a cada notificação. Cada instância do servidor mantém
// uma única conexão LISTEN que repassa os avisos aos navegadores conectados por SSE.
// LISTEN exige conexão direta — no Neon, DIRECT_URL (sem -pooler).

const CHANNELS = ["plantao_board", "plantao_user"] as const;
type ChannelName = (typeof CHANNELS)[number];

type Listener = { channel: ChannelName; id: string; onChange: () => void };

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
      if (!msg.payload) return;
      for (const listener of listeners) {
        if (listener.channel === msg.channel && listener.id === msg.payload) listener.onChange();
      }
    });
    client.on("error", reset);
    client.on("end", () => (state.realtimeClient = null));
    try {
      await client.connect();
      for (const channel of CHANNELS) await client.query(`LISTEN ${channel}`);
    } catch (err) {
      reset();
      throw err;
    }
    return client;
  })();
  return state.realtimeClient;
}

/** Inscreve um ouvinte para mudanças de um quadro. Retorna a função para cancelar. */
export function subscribeToBoard(boardId: string, onChange: () => void): Promise<() => void> {
  return subscribe({ channel: "plantao_board", id: boardId, onChange });
}

/** Inscreve um ouvinte para as notificações de uma pessoa. */
export function subscribeToUser(userId: string, onChange: () => void): Promise<() => void> {
  return subscribe({ channel: "plantao_user", id: userId, onChange });
}

async function subscribe(listener: Listener): Promise<() => void> {
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
