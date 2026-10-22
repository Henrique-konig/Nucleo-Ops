import { getIntegrationById } from "@/lib/integrations";
import { safeEqual } from "@/lib/channels/signature";
import { syncPullRequest } from "@/lib/code-links";
import { kickJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";

type MergeRequestPayload = {
  object_kind?: string;
  object_attributes?: { url: string; title: string; description: string | null; state: string; source_branch?: string };
};

// Webhook do GitLab (Merge request events), autenticado pelo X-Gitlab-Token.
export async function POST(request: Request, ctx: RouteContext<"/api/integrations/gitlab/[integrationId]">) {
  const { integrationId } = await ctx.params;
  const integration = await getIntegrationById(integrationId, "GITLAB");
  if (!integration || !safeEqual(request.headers.get("x-gitlab-token") ?? "", integration.config.webhookToken)) {
    return new Response("Token inválido", { status: 401 });
  }
  const payload = (await request.json()) as MergeRequestPayload;
  const mr = payload.object_attributes;
  if (payload.object_kind !== "merge_request" || !mr) return Response.json({ ignored: payload.object_kind });
  const linked = await syncPullRequest(integration.teamId, {
    provider: "gitlab",
    url: mr.url,
    title: mr.title,
    state: mr.state === "opened" ? "open" : mr.state,
    texts: [mr.description, mr.source_branch],
  });
  kickJobs();
  return Response.json({ linked });
}
