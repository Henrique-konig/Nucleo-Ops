import { getIntegrationById } from "@/lib/integrations";
import { verifySha256Signature } from "@/lib/channels/signature";
import { syncPullRequest } from "@/lib/code-links";
import { kickJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";

type PullRequestPayload = {
  action?: string;
  pull_request?: { html_url: string; title: string; body: string | null; state: string; merged?: boolean; head?: { ref?: string } };
};

// Webhook do GitHub (evento pull_request), assinado com X-Hub-Signature-256.
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/github/[integrationId]">) {
  const { integrationId } = await ctx.params;
  const integration = await getIntegrationById(integrationId, "GITHUB");
  const body = await request.text();
  if (!integration || !verifySha256Signature(integration.config.webhookSecret, body, request.headers.get("x-hub-signature-256"))) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  const event = request.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true });
  if (event !== "pull_request") return Response.json({ ignored: event });

  const { pull_request: pr } = JSON.parse(body) as PullRequestPayload;
  if (!pr) return Response.json({ ignored: "sem pull_request" });
  const linked = await syncPullRequest(integration.teamId, {
    provider: "github",
    url: pr.html_url,
    title: pr.title,
    state: pr.merged ? "merged" : pr.state,
    texts: [pr.body, pr.head?.ref],
  });
  kickJobs();
  return Response.json({ linked });
}
