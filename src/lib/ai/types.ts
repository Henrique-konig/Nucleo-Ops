import { z } from "zod";
import type { Priority } from "@/generated/prisma/enums";

// Contrato entre os agentes e o provedor de modelos. Trocar de provedor é
// implementar esta interface (risco "dependência de um único fornecedor").

export type AiCall = { model: string; inputTokens: number; outputTokens: number; costMicroUsd: number };
export type AiResult<T> = { data: T; usage: AiCall | null };

export type TriageInput = {
  title: string;
  description: string;
  categories: string[];
  members: { id: string; name: string; openCards: number; onCall: boolean }[];
};

export const triageOutputSchema = z.object({
  category: z.string().describe("Uma das categorias da lista"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  suggestedAssigneeId: z.string().nullable().describe("id de um membro da lista, ou null"),
  reason: z.string().describe("Justificativa curta, em português, para a equipe"),
});
export type TriageOutput = z.infer<typeof triageOutputSchema> & { priority: Priority };

export type Source = { type: "document" | "ticket"; id: string; title: string; content: string };

export type DraftInput = {
  ticket: { title: string; description: string };
  conversation: { from: "solicitante" | "equipe"; content: string }[];
  sources: Source[];
};

export const draftOutputSchema = z.object({
  reply: z.string().describe("Resposta ao solicitante, em português"),
  usedSourceIds: z.array(z.string()).describe("ids das fontes usadas"),
  confident: z.boolean().describe("true se as fontes respondem à pergunta"),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

export type ChatInput = {
  question: string;
  history: { from: "solicitante" | "assistente"; content: string }[];
  sources: Source[];
  requesterTickets: { id: string; title: string; status: string }[];
};

export const chatOutputSchema = z.object({
  answer: z.string().describe("Resposta ao solicitante, em português"),
  usedSourceIds: z.array(z.string()),
  // O assistente não resolve: precisa de uma pessoa.
  handoff: z.boolean(),
  handoffTitle: z.string().nullable().describe("Assunto do chamado, quando handoff = true"),
});
export type ChatOutput = z.infer<typeof chatOutputSchema>;

export type SummaryInput = {
  periodLabel: string;
  stats: Record<string, number | string>;
  highlights: { title: string; status: string; category: string | null; resolvedByAgent: boolean }[];
};

export const summaryOutputSchema = z.object({
  summary: z.string().describe("Relatório em português, em markdown simples"),
});

export type ExecutionCatalogItem = { key: string; label: string; description: string; params: Record<string, string> };

export type ExecutionInput = {
  ticket: { title: string; description: string };
  catalog: ExecutionCatalogItem[];
};

export const executionOutputSchema = z.object({
  actionKey: z.string().nullable().describe("chave de uma ação do catálogo, ou null se nenhuma se aplica"),
  params: z.record(z.string(), z.string()),
  reason: z.string(),
});
export type ExecutionOutput = z.infer<typeof executionOutputSchema>;

export type AgentRunInput = {
  agent: { name: string; role: string; instructions: string };
  // Pedido extra de quem disparou a execução.
  request: string | null;
  card: {
    title: string;
    description: string | null;
    board: string;
    column: string;
    dueDate: string | null;
    assignee: string | null;
    labels: string[];
    checklist: { text: string; done: boolean }[];
  };
  ticket: {
    title: string;
    description: string;
    status: string;
    priority: string;
    category: string | null;
    conversation: { from: "solicitante" | "equipe"; content: string; internal: boolean }[];
  } | null;
  sources: Source[];
};

export const agentRunOutputSchema = z.object({
  output: z.string().describe("Resultado do trabalho do agente, em português, em markdown simples"),
  usedSourceIds: z.array(z.string()).describe("ids das fontes usadas"),
});
export type AgentRunOutput = z.infer<typeof agentRunOutputSchema>;

export interface AiProvider {
  readonly name: string;
  triage(input: TriageInput): Promise<AiResult<TriageOutput>>;
  draftReply(input: DraftInput): Promise<AiResult<DraftOutput>>;
  chat(input: ChatInput): Promise<AiResult<ChatOutput>>;
  summarize(input: SummaryInput): Promise<AiResult<{ summary: string }>>;
  proposeExecution(input: ExecutionInput): Promise<AiResult<ExecutionOutput>>;
  runAgent(input: AgentRunInput): Promise<AiResult<AgentRunOutput>>;
}

export class AiRefusalError extends Error {}
