import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { safeEqual } from "@/lib/channels/signature";
import { BusinessError } from "@/lib/errors";
import { agentPermissions, DEFAULT_AGENTS, DEFAULT_COLUMNS, DEFAULT_LABELS } from "@/lib/team-defaults";

// Primeira configuração de uma instalação nova: cria a equipe, o quadro, os
// agentes e o primeiro administrador. Só funciona enquanto não existe equipe, e
// exige o SETUP_TOKEN quando ele está definido (recomendado em produção).

export async function needsSetup() {
  return (await db.team.count()) === 0;
}

export function setupTokenRequired() {
  return Boolean(process.env.SETUP_TOKEN);
}

const setupSchema = z.object({
  teamName: z.string().trim().min(2, "Informe o nome da equipe").max(80),
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.email("E-mail inválido").transform((v) => v.toLowerCase()),
  password: z.string().min(12, "A senha precisa ter pelo menos 12 caracteres").max(200),
  token: z.string().optional(),
});

export async function runSetup(input: z.input<typeof setupSchema>) {
  const data = setupSchema.parse(input);
  const expected = process.env.SETUP_TOKEN;
  if (expected && !safeEqual(data.token ?? "", expected)) throw new BusinessError("Código de configuração inválido");
  const passwordHash = await bcrypt.hash(data.password, 12);

  return db.$transaction(async (tx) => {
    // Trava para duas configurações simultâneas não criarem duas equipes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724713)`;
    if ((await tx.team.count()) > 0) throw new BusinessError("Esta instalação já foi configurada");

    const team = await tx.team.create({ data: { name: data.teamName } });
    const admin = await tx.user.create({ data: { name: data.name, email: data.email, role: "ADMIN", passwordHash, teamId: team.id } });
    await tx.board.create({
      data: { name: "Atendimento", teamId: team.id, columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, position: (i + 1) * 1024 })) } },
    });
    await tx.label.createMany({ data: DEFAULT_LABELS.map((l) => ({ ...l, teamId: team.id })) });
    await tx.agent.createMany({ data: DEFAULT_AGENTS.map((a) => ({ ...a, teamId: team.id, permissions: agentPermissions(a.type) })) });
    await recordAction(tx, { teamId: team.id, userId: admin.id, type: "team.setup", targetType: "team", targetId: team.id, payload: { name: team.name } });
    return { teamId: team.id };
  });
}
