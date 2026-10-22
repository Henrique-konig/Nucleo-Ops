import "server-only";
import { after } from "next/server";
import { processJobs } from "./queue";
import { jobHandlers } from "./handlers";

/** Processa a fila logo depois da resposta, sem esperar o cron. */
export function kickJobs() {
  after(async () => {
    try {
      await processJobs(jobHandlers, 25);
    } catch (err) {
      console.error("[jobs] falha ao processar a fila", err);
    }
  });
}

export function runJobs(limit?: number) {
  return processJobs(jobHandlers, limit);
}
