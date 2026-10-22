import { isAuthorizedCron } from "@/lib/cron";
import { runDailyMaintenance } from "@/lib/maintenance";
import { runJobs } from "@/lib/jobs/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Não autorizado", { status: 401 });
  const teams = await runDailyMaintenance();
  const processed = await runJobs(200);
  return Response.json({ teams, processed });
}
