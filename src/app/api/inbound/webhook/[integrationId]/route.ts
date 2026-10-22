import { ZodError } from "zod";
import { getIntegrationById } from "@/lib/integrations";
import { verifySha256Signature } from "@/lib/channels/signature";
import { webhookTicketSchema } from "@/lib/inbound";
import { createTicket } from "@/lib/tickets";
import { kickJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";

// Webhook genérico de abertura de chamados. O corpo deve ser assinado:
// X-Plantao-Signature: sha256=<hmac-sha256(corpo, segredo)>.
export async function POST(request: Request, ctx: RouteContext<"/api/inbound/webhook/[integrationId]">) {
  const { integrationId } = await ctx.params;
  const integration = await getIntegrationById(integrationId, "WEBHOOK");
  const body = await request.text();
  if (!integration || !verifySha256Signature(integration.config.secret, body, request.headers.get("x-plantao-signature"))) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  try {
    const data = webhookTicketSchema.parse(JSON.parse(body));
    const { ticket, created } = await createTicket({
      teamId: integration.teamId,
      channel: "WEBHOOK",
      externalId: `${integration.id}:${data.id}`,
      title: data.title,
      description: data.description,
      priority: data.priority,
      category: data.category,
      requester: data.requester,
    });
    kickJobs();
    return Response.json({ ticketId: ticket.id, created }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ZodError || err instanceof SyntaxError) return Response.json({ error: "Corpo inválido" }, { status: 400 });
    throw err;
  }
}
