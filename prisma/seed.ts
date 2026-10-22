// Dados iniciais: uma equipe, um usuário por papel, o quadro de atendimento e os
// agentes, documentos de exemplo e e-mail em modo log. Pode rodar mais de uma vez.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "../src/lib/prisma-client";
import type { Role } from "../src/generated/prisma/enums";
import { agentPermissions, DEFAULT_AGENTS, DEFAULT_COLUMNS, DEFAULT_LABELS } from "../src/lib/team-defaults";
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

const documents = [
  {
    title: "Como redefinir a senha de rede",
    content:
      "1. Acesse https://senha.exemplo.com pelo navegador.\n2. Informe seu e-mail corporativo e clique em Redefinir senha.\n3. Confirme o código enviado por SMS.\n4. Crie uma senha com pelo menos 12 caracteres.\nA nova senha vale para e-mail, VPN e Wi-Fi em até 15 minutos. Se a conta estiver bloqueada, abra um chamado.",
  },
  {
    title: "VPN não conecta",
    content:
      "Verifique se a senha de rede não expirou. No cliente da VPN, remova o perfil e importe de novo pelo portal. Se aparecer o erro 809, a rede local bloqueia a VPN: teste pelo roteador do celular. Persistindo, abra um chamado informando o código do erro.",
  },
  {
    title: "Impressora com fila travada",
    content:
      "No Windows, abra Configurações > Impressoras, selecione a impressora e clique em Abrir fila. Cancele todos os documentos e desligue a impressora por 30 segundos. Se continuar, reinicie o serviço Spooler de impressão ou abra um chamado.",
  },
];

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

  for (const l of DEFAULT_LABELS) {
    await db.label.upsert({ where: { teamId_name: { teamId: team.id, name: l.name } }, update: {}, create: { ...l, teamId: team.id } });
  }

  for (const agent of DEFAULT_AGENTS) {
    await db.agent.upsert({
      where: { teamId_type: { teamId: team.id, type: agent.type } },
      update: {},
      create: { teamId: team.id, ...agent, permissions: agentPermissions(agent.type) },
    });
  }

  if ((await db.document.count({ where: { teamId: team.id } })) === 0) {
    await db.document.createMany({ data: documents.map((d) => ({ ...d, teamId: team.id })) });
  }

  if (!(await db.board.findFirst({ where: { teamId: team.id } }))) {
    await db.board.create({
      data: {
        name: "Atendimento",
        teamId: team.id,
        columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, position: (i + 1) * 1024 })) },
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
