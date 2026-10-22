import { getIntegrationById } from "@/lib/integrations";
import { verifySlackSignature } from "@/lib/channels/signature";
import { resolveSlackUser } from "@/lib/channels/slack-users";
import { runUserCommand } from "@/lib/commands";
import { kickJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";

// Comando /plantao do Slack. Configure no app do Slack um Slash Command apontando
// para esta URL; a assinatura usa o Signing Secret da integração.
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/slack/[integrationId]">) {
  const { integrationId } = await ctx.params;
  const integration = await getIntegrationById(integrationId, "SLACK");
  const body = await request.text();
  if (
    !integration ||
    !verifySlackSignature(integration.config.signingSecret, body, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))
  ) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  const form = new URLSearchParams(body);
  const slackUserId = form.get("user_id") ?? "";
  const user = await resolveSlackUser(integration.config, integration.teamId, slackUserId);
  const text = user
    ? await runUserCommand(user, form.get("text") ?? "", "SLACK")
    : "Não encontrei seu usuário no Plantão. Peça ao administrador para vincular seu Slack.";
  kickJobs();
  return Response.json({ response_type: "ephemeral", text });
}
