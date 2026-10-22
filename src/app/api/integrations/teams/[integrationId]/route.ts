import { getIntegrationById } from "@/lib/integrations";
import { verifyTeamsSignature } from "@/lib/channels/signature";
import { runAnonymousCommand } from "@/lib/commands";

export const runtime = "nodejs";

// Webhook de saída do Teams (mencione o bot no canal: "@Plantão status 1a2b3c4d").
// O Teams não informa o e-mail de quem chamou, então só há consultas.
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/teams/[integrationId]">) {
  const { integrationId } = await ctx.params;
  const integration = await getIntegrationById(integrationId, "TEAMS");
  const body = await request.text();
  if (!integration?.config.outgoingSecret || !verifyTeamsSignature(integration.config.outgoingSecret, body, request.headers.get("authorization"))) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  const payload = JSON.parse(body) as { text?: string };
  // Remove a menção ao bot (<at>Plantão</at>) e o HTML do texto.
  const text = (payload.text ?? "").replace(/<at>.*?<\/at>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  return Response.json({ type: "message", text: await runAnonymousCommand(integration.teamId, text) });
}
