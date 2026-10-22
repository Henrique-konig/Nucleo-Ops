import type { Priority, TicketStatus } from "@/generated/prisma/enums";

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300",
  IN_PROGRESS: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  WAITING: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  RESOLVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  CLOSED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const STATUS_DOT: Record<TicketStatus, string> = {
  OPEN: "bg-brand-500", IN_PROGRESS: "bg-amber-500", WAITING: "bg-violet-500", RESOLVED: "bg-emerald-500", CLOSED: "bg-slate-400",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  HIGH: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  URGENT: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};
const PRIORITY_BARS: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };

// Rótulos duplicados aqui (e não importados de lib/tickets) porque este arquivo
// também é usado em componentes de cliente.
const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Aberto", IN_PROGRESS: "Em andamento", WAITING: "Aguardando solicitante", RESOLVED: "Resolvido", CLOSED: "Encerrado",
};
const PRIORITY_LABELS: Record<Priority, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" };

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge ${STATUS_STYLE[status]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge ${PRIORITY_STYLE[priority]}`}>
      <span aria-hidden className="flex h-2.5 items-end gap-px">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`w-[2px] rounded-full bg-current ${n <= PRIORITY_BARS[priority] ? "" : "opacity-25"}`} style={{ height: `${n * 25}%` }} />
        ))}
      </span>
      <span className="sr-only">Prioridade </span>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}
