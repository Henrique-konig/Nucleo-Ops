import type { Priority, TicketStatus } from "@/generated/prisma/enums";

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  IN_PROGRESS: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  WAITING: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  RESOLVED: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
  CLOSED: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  MEDIUM: "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  HIGH: "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  URGENT: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100",
};

// Rótulos duplicados aqui (e não importados de lib/tickets) porque este arquivo
// também é usado em componentes de cliente.
const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Aberto", IN_PROGRESS: "Em andamento", WAITING: "Aguardando solicitante", RESOLVED: "Resolvido", CLOSED: "Encerrado",
};
const PRIORITY_LABELS: Record<Priority, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" };

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_STYLE[priority]}`}>Prioridade {PRIORITY_LABELS[priority].toLowerCase()}</span>;
}

export function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}
