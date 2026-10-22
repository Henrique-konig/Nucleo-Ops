import "server-only";
import { hmacSha256Hex } from "./signature";
import type { IntegrationConfig } from "@/lib/integrations";

/** Envia um evento ao sistema de origem, assinado com o segredo da integração. */
export async function postWebhookCallback(config: IntegrationConfig<"WEBHOOK">, event: Record<string, unknown>) {
  if (!config.callbackUrl) return;
  const body = JSON.stringify(event);
  const res = await fetch(config.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Plantao-Signature": `sha256=${hmacSha256Hex(config.secret, body)}` },
    body,
  });
  if (!res.ok) throw new Error(`Callback do webhook respondeu ${res.status}`);
}
