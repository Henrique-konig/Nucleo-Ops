"use server";

import { runAction } from "@/lib/action-result";
import { requestReport } from "@/lib/agents/summary";

export async function requestReportAction(period: "DAILY" | "WEEKLY") {
  return runAction((u) => requestReport(u, period), ["/relatorios"]);
}
