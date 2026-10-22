import "server-only";
import type { JobHandler } from "./queue";
import { notifyRequesterJob, notifyTeamJob } from "@/lib/notifications";
import { runAutomationJob } from "@/lib/automations";
import { ticketCreatedJob } from "@/lib/ticket-events";

// Todas as tarefas que a fila sabe executar.
export const jobHandlers: Record<string, JobHandler> = {
  "ticket.created": ticketCreatedJob,
  "ticket.requester_message": async () => {},
  "notify.requester": notifyRequesterJob,
  "notify.team": notifyTeamJob,
  "automation.run": runAutomationJob,
};
