import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Fila de tarefas no próprio Postgres. Cada tarefa roda com retentativa e espera
// exponencial; várias instâncias podem processar ao mesmo tempo graças ao
// FOR UPDATE SKIP LOCKED. Disparada logo após a requisição (after) e por cron.

type Client = Prisma.TransactionClient | typeof db;

export type JobInput = {
  teamId: string;
  type: string;
  payload?: Prisma.InputJsonValue;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
};

export async function enqueue(client: Client, job: JobInput) {
  if (job.dedupeKey) {
    return client.job.upsert({
      where: { dedupeKey: job.dedupeKey },
      update: {},
      create: { ...job, payload: job.payload ?? {} },
    });
  }
  return client.job.create({ data: { ...job, payload: job.payload ?? {} } });
}

export type JobHandler = (job: { id: string; teamId: string; payload: Prisma.JsonValue; attempts: number }) => Promise<void>;

/** Erro que não adianta tentar de novo (dados inválidos, recurso removido). */
export class PermanentJobError extends Error {}

const LOCK_TIMEOUT_MS = 5 * 60_000;

export function backoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 15_000 * 2 ** (attempts - 1));
}

/** Processa até `limit` tarefas prontas. Retorna quantas foram processadas. */
export async function processJobs(handlers: Record<string, JobHandler>, limit = 20): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    const [job] = await db.$queryRaw<{ id: string; teamId: string; type: string; payload: Prisma.JsonValue; attempts: number; maxAttempts: number }[]>`
      UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "Job"
        WHERE (status = 'QUEUED' AND "runAt" <= now())
           OR (status = 'RUNNING' AND "lockedAt" < now() - make_interval(secs => ${LOCK_TIMEOUT_MS / 1000}))
        ORDER BY "runAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, "teamId", type, payload, attempts, "maxAttempts"`;
    if (!job) break;
    processed++;

    const handler = handlers[job.type];
    try {
      if (!handler) throw new PermanentJobError(`Tarefa desconhecida: ${job.type}`);
      await handler(job);
      await db.job.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date(), lockedAt: null, lastError: null } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const final = err instanceof PermanentJobError || job.attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: final
          ? { status: "FAILED", finishedAt: new Date(), lockedAt: null, lastError: message }
          : { status: "QUEUED", lockedAt: null, lastError: message, runAt: new Date(Date.now() + backoffMs(job.attempts)) },
      });
      if (final) console.error(`[jobs] ${job.type} ${job.id} falhou: ${message}`);
    }
  }
  return processed;
}
