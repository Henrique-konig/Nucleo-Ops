// Dados iniciais: uma equipe, um usuário por papel, o quadro de atendimento e os
// agentes (desativados e em modo de simulação). Pode rodar mais de uma vez.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "../src/lib/prisma-client";
import type { AgentType, Role, TicketStatus } from "../src/generated/prisma/enums";
import { sealIntegrationConfig } from "../src/lib/integrations";

const db = createPrismaClient();

const password = process.env.SEED_PASSWORD ?? "plantao-dev";

const users: { name: string; email: string; role: Role }[] = [
  { name: "Ana Administradora", email: "admin@plantao.local", role: "ADMIN" },
  { name: "Carlos Coordenador", email: "coordenador@plantao.local", role: "COORDINATOR" },
  { name: "Tânia Técnica", email: "tecnico@plantao.local", role: "TECHNICIAN" },
  { name: "Sérgio Solicitante", email: "solicitante@plantao.local", role: "REQUESTER" },
  { name: "Aurora Auditora", email: "auditor@plantao.local", role: "AUDITOR" },
];

const columns: { name: string; ticketStatus: TicketStatus | null }[] = [
  { name: "Entrada", ticketStatus: "OPEN" },
  { name: "Em andamento", ticketStatus: "IN_PROGRESS" },
  { name: "Em revisão", ticketStatus: null },
  { name: "Concluído", ticketStatus: "RESOLVED" },
];
const labels = [
  { name: "Acesso", color: "sky" },
  { name: "Rede", color: "violet" },
  { name: "Urgente", color: "red" },
];
const agents: AgentType[] = ["TRIAGE", "RESEARCH", "EXECUTION", "SUMMARY"];

async function main() {
  const team =
    (await db.team.findFirst({ where: { name: "TI" } })) ??
    (await db.team.create({ data: { name: "TI", timezone: "America/Sao_Paulo", aiMonthlyBudgetCents: 50_000 } }));

  const passwordHash = await bcrypt.hash(password, 12);
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, teamId: team.id },
    });
  }

  for (const l of labels) {
    await db.label.upsert({ where: { teamId_name: { teamId: team.id, name: l.name } }, update: {}, create: { ...l, teamId: team.id } });
  }

  for (const type of agents) {
    await db.agent.upsert({
      where: { teamId_type: { teamId: team.id, type } },
      update: {},
      create: { teamId: team.id, type, active: false, dryRun: true, permissions: { allowedActions: [], perMinute: 10, perDay: 500 } },
    });
  }

  if (!(await db.board.findFirst({ where: { teamId: team.id } }))) {
    await db.board.create({
      data: {
        name: "Atendimento",
        teamId: team.id,
        columns: { create: columns.map((c, i) => ({ ...c, position: (i + 1) * 1024 })) },
      },
    });
  }

  // E-mail em modo "log": as mensagens aparecem no console até configurar um provedor.
  if (!(await db.integration.findFirst({ where: { teamId: team.id, type: "EMAIL" } }))) {
    await db.integration.create({
      data: {
        teamId: team.id,
        type: "EMAIL",
        name: "E-mail (desenvolvimento)",
        configEncrypted: sealIntegrationConfig("EMAIL", {
          provider: "log",
          from: "Plantão <plantao@exemplo.com>",
          inboundToken: randomBytes(24).toString("hex"),
        }),
      },
    });
  }

  console.log(`Seed concluído. Usuários: ${users.map((u) => u.email).join(", ")}`);
  console.log(`Senha inicial: ${process.env.SEED_PASSWORD ? "(SEED_PASSWORD)" : password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
