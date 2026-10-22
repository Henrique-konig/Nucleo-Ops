import "server-only";
import type { IntegrationConfig } from "@/lib/integrations";

/** Envia uma mensagem ao canal do Teams pelo webhook de entrada (Workflows/Incoming Webhook). */
export async function postTeamsMessage(config: IntegrationConfig<"TEAMS">, text: string) {
  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [{ type: "TextBlock", text, wrap: true }],
          },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Teams recusou a mensagem (${res.status})`);
}
