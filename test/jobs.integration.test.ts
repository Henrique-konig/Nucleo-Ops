import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, testDb as db } from "./fixtures";
import { backoffMs, enqueue, PermanentJobError, processJobs } from "@/lib/jobs/queue";

let teamId: string;

describe.skipIf(!hasDb)("fila de tarefas (integração)", () => {
  beforeAll(async () => {
    teamId = (await createTeamFixture("jobs")).team.id;
    // Isola o teste das tarefas pendentes de outros testes.
    await db.job.updateMany({ where: { status: "QUEUED", teamId: { not: teamId } }, data: { runAt: new Date(Date.now() + 86_400_000) } });
  });
  afterAll(() => db.$disconnect());

  it("espera exponencial com teto de 1 hora", () => {
    expect(backoffMs(1)).toBe(15_000);
    expect(backoffMs(2)).toBe(30_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });

  it("executa, reagenda em caso de erro e falha de vez no erro permanente", async () => {
    const ok = await enqueue(db, { teamId, type: "t.ok", payload: { n: 1 } });
    const flaky = await enqueue(db, { teamId, type: "t.flaky", maxAttempts: 2 });
    const bad = await enqueue(db, { teamId, type: "t.bad" });
    const seen: unknown[] = [];
    const handlers = {
      "t.ok": async (job: { payload: unknown }) => { seen.push(job.payload); },
      "t.flaky": async () => { throw new Error("rede"); },
      "t.bad": async () => { throw new PermanentJobError("inválido"); },
    };
    await processJobs(handlers, 10);
    expect(seen).toEqual([{ n: 1 }]);
    expect((await db.job.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe("DONE");
    const f1 = await db.job.findUniqueOrThrow({ where: { id: flaky.id } });
    expect(f1).toMatchObject({ status: "QUEUED", attempts: 1, lastError: "rede" });
    expect(f1.runAt.getTime()).toBeGreaterThan(Date.now());
    expect((await db.job.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("FAILED");

    // Segunda tentativa esgota maxAttempts.
    await db.job.update({ where: { id: flaky.id }, data: { runAt: new Date() } });
    await processJobs(handlers, 10);
    expect((await db.job.findUniqueOrThrow({ where: { id: flaky.id } })).status).toBe("FAILED");
  });

  it("dedupeKey evita tarefa duplicada", async () => {
    const a = await enqueue(db, { teamId, type: "t.ok", dedupeKey: `k-${teamId}` });
    const b = await enqueue(db, { teamId, type: "t.ok", dedupeKey: `k-${teamId}` });
    expect(a.id).toBe(b.id);
  });
});
