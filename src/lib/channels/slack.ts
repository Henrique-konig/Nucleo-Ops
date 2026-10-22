import "server-only";
import type { IntegrationConfig } from "@/lib/integrations";

/** Publica uma mensagem num canal ou DM (channel = id do canal ou do usuário). */
export async function postSlackMessage(config: IntegrationConfig<"SLACK">, channel: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.botToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(`Slack recusou a mensagem: ${data.error}`);
}
