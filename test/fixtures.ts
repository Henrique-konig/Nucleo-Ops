import { createPrismaClient } from "@/lib/prisma-client";
import type { Role, TicketStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/errors";

export const hasDb = Boolean(process.env.DATABASE_URL);
export const testDb = hasDb ? createPrismaClient() : (null as never);

/** Equipe isolada com um usuário por papel e o quadro padrão (colunas ligadas a status). */
export async function createTeamFixture(label = "t") {
  const run = `${label}-${Math.random().toString(36).slice(2, 8)}`;
  const team = await testDb.team.create({ data: { name: `teste-${run}` } });
  const actors = {} as Record<Role, Actor>;
  for (const role of ["REQUESTER", "TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"] as Role[]) {
    const u = await testDb.user.create({ data: { name: `${role} ${run}`, email: `${role.toLowerCase()}-${run}@teste.local`, role, teamId: team.id } });
    actors[role] = { id: u.id, role, teamId: team.id };
  }
  const columns: [string, TicketStatus | null][] = [["Entrada", "OPEN"], ["Em andamento", "IN_PROGRESS"], ["Revisão", null], ["Concluído", "RESOLVED"]];
  const board = await testDb.board.create({
    data: {
      name: "Atendimento",
      teamId: team.id,
      columns: { create: columns.map(([name, ticketStatus], i) => ({ name, ticketStatus, position: (i + 1) * 1024 })) },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  return { run, team, actors, board, columnIds: board.columns.map((c) => c.id) };
}

export async function jobsOf(teamId: string, type?: string) {
  return testDb.job.findMany({ where: { teamId, ...(type && { type }) }, orderBy: { createdAt: "asc" } });
}
