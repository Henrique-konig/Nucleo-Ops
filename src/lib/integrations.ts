import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptConfig, encryptConfig } from "@/lib/crypto";
import type { IntegrationType } from "@/generated/prisma/enums";

// Formato da configuração de cada integração. Tudo é cifrado antes de ir ao banco.
export const integrationSchemas = {
  EMAIL: z.object({
    provider: z.enum(["resend", "log"]).default("log"),
    apiKey: z.string().optional(),
    from: z.string().min(3),
    // Token que o provedor de e-mail de entrada envia no cabeçalho Authorization.
    inboundToken: z.string().min(16),
  }),
  SLACK: z.object({
    botToken: z.string().startsWith("xoxb-"),
    signingSecret: z.string().min(8),
    channelId: z.string().min(1),
  }),
  TEAMS: z.object({
    webhookUrl: z.url(),
    // Segredo (base64) do webhook de saída do Teams, para comandos.
    outgoingSecret: z.string().optional(),
  }),
  GITHUB: z.object({ webhookSecret: z.string().min(8) }),
  GITLAB: z.object({ webhookToken: z.string().min(8) }),
  GOOGLE_CALENDAR: z.object({
    // Endereço iCal (secreto) da agenda da escala de plantão.
    icsUrl: z.url(),
  }),
  WEBHOOK: z.object({
    secret: z.string().min(16),
    // Para onde enviar as atualizações dos chamados abertos por este webhook.
    callbackUrl: z.url().optional(),
  }),
  AUTOMATION: z.object({
    // Endpoint que executa as ações (recebe POST assinado com X-Plantao-Signature).
    url: z.url(),
    secret: z.string().min(16),
  }),
} satisfies Record<IntegrationType, z.ZodType>;

export type IntegrationConfig<T extends IntegrationType> = z.infer<(typeof integrationSchemas)[T]>;

export function sealIntegrationConfig<T extends IntegrationType>(type: T, config: unknown): string {
  return encryptConfig(integrationSchemas[type].parse(config));
}

export function openIntegrationConfig<T extends IntegrationType>(type: T, sealed: string): IntegrationConfig<T> {
  return integrationSchemas[type].parse(decryptConfig(sealed)) as IntegrationConfig<T>;
}

/** Integração ativa de um tipo para a equipe (a mais recente), já decifrada. */
export async function getIntegration<T extends IntegrationType>(teamId: string, type: T) {
  const row = await db.integration.findFirst({ where: { teamId, type, active: true }, orderBy: { createdAt: "desc" } });
  if (!row) return null;
  return { id: row.id, teamId: row.teamId, config: openIntegrationConfig(type, row.configEncrypted) };
}

/** Integração por id (rotas de entrada), conferindo o tipo. */
export async function getIntegrationById<T extends IntegrationType>(id: string, type: T) {
  const row = await db.integration.findFirst({ where: { id, type, active: true } });
  if (!row) return null;
  return { id: row.id, teamId: row.teamId, config: openIntegrationConfig(type, row.configEncrypted) };
}

export function appUrl(path = ""): string {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
