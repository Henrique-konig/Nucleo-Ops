import type { AgentType, TicketStatus } from "@/generated/prisma/enums";

// Configuração inicial de uma equipe, usada pelo seed e pela primeira configuração.

export const DEFAULT_COLUMNS: { name: string; ticketStatus: TicketStatus | null }[] = [
  { name: "Entrada", ticketStatus: "OPEN" },
  { name: "Em andamento", ticketStatus: "IN_PROGRESS" },
  { name: "Em revisão", ticketStatus: null },
  { name: "Concluído", ticketStatus: "RESOLVED" },
];

export const DEFAULT_LABELS = [
  { name: "Acesso", color: "sky" },
  { name: "Rede", color: "violet" },
  { name: "Urgente", color: "red" },
];

// Triagem, pesquisa, resumo e chatbot começam ativos (sem chave de API usam o provedor
// local, sem custo). Execução começa desligada e em simulação.
export const DEFAULT_AGENTS: { type: AgentType; active: boolean; dryRun: boolean }[] = [
  { type: "TRIAGE", active: true, dryRun: false },
  { type: "RESEARCH", active: true, dryRun: false },
  { type: "EXECUTION", active: false, dryRun: true },
  { type: "SUMMARY", active: true, dryRun: false },
  { type: "CHATBOT", active: true, dryRun: false },
];

export function agentPermissions(type: AgentType) {
  return {
    allowedActions: type === "EXECUTION" ? ["reset_password", "unlock_account", "add_to_group"] : [],
    perMinute: 30,
    perDay: 2000,
  };
}
