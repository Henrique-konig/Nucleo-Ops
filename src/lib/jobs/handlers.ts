import "server-only";
import type { JobHandler } from "./queue";
import { notifyAssigneeJob, notifyRequesterJob, notifyTeamJob } from "@/lib/notifications";
import { runAutomationJob } from "@/lib/automations";
import { ticketCreatedJob, ticketHandoffJob } from "@/lib/ticket-events";
import { triageJob } from "@/lib/agents/triage";
import { researchJob } from "@/lib/agents/research";
import { embedDocumentJob } from "@/lib/knowledge";
import { proposeExecutionJob, runExecutionJob } from "@/lib/execution/service";
import { summaryJob } from "@/lib/agents/summary";
import { customAgentJob } from "@/lib/custom-agents";

// Todas as tarefas que a fila sabe executar.
export const jobHandlers: Record<string, JobHandler> = {
  "ticket.created": ticketCreatedJob,
  "ticket.handoff": ticketHandoffJob,
  "ticket.requester_message": async () => {},
  "notify.requester": notifyRequesterJob,
  "notify.team": notifyTeamJob,
  "notify.assignee": notifyAssigneeJob,
  "automation.run": runAutomationJob,
  "agent.triage": triageJob,
  "agent.research": researchJob,
  "document.embed": embedDocumentJob,
  "agent.execution": proposeExecutionJob,
  "execution.run": runExecutionJob,
  "agent.summary": summaryJob,
  "agent.custom": customAgentJob,
};
