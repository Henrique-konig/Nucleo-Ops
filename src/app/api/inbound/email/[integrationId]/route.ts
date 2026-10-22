import { ZodError } from "zod";
import { getIntegrationById } from "@/lib/integrations";
import { safeEqual } from "@/lib/channels/signature";
import { handleInboundEmail, parseInboundEmail } from "@/lib/inbound";
import { kickJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";

// Entrada de e-mail (RF-01). O provedor de e-mail de entrada chama esta rota com
// "Authorization: Bearer <inboundToken>" configurado na integração de e-mail.
export async function POST(request: Request, ctx: RouteContext<"/api/inbound/email/[integrationId]">) {
  const { integrationId } = await ctx.params;
  const integration = await getIntegrationById(integrationId, "EMAIL");
  const auth = request.headers.get("authorization") ?? "";
  if (!integration || !safeEqual(auth, `Bearer ${integration.config.inboundToken}`)) {
    return new Response("Não autorizado", { status: 401 });
  }

  try {
    const email = parseInboundEmail(await request.json());
    const result = await handleInboundEmail(integration.teamId, email);
    kickJobs();
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ZodError || err instanceof SyntaxError) return Response.json({ error: "Formato de e-mail inválido" }, { status: 400 });
    throw err;
  }
}
