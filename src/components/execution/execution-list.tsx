import { Fragment } from "react";
import Link from "next/link";
import { ACTIONS } from "@/lib/execution/catalog";
import { ActionForm } from "@/components/tickets/action-form";
import { formatDateTime } from "@/components/tickets/badges";
import { approveExecution, rejectExecution } from "@/app/(app)/execucoes/actions";
import type { ExecutionStatus } from "@/generated/prisma/enums";

const STATUS: Record<ExecutionStatus, { label: string; style: string }> = {
  PROPOSED: { label: "Aguardando confirmação", style: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100" },
  APPROVED: { label: "Confirmada, executando", style: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100" },
  REJECTED: { label: "Rejeitada", style: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" },
  EXECUTED: { label: "Executada", style: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100" },
  SIMULATED: { label: "Simulada", style: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100" },
  FAILED: { label: "Falhou", style: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100" },
};

export type ExecutionRow = {
  id: string;
  actionKey: string;
  params: unknown;
  reason: string | null;
  status: ExecutionStatus;
  dryRun: boolean;
  createdAt: Date;
  result: unknown;
  ticket: { id: string; title: string } | null;
  proposedBy: { id: string; name: string } | null;
  proposedByAgent: { id: string } | null;
  decidedBy: { name: string } | null;
};

export function ExecutionList({
  rows, canDecide, canDecideSensitive, currentUserId,
}: { rows: ExecutionRow[]; canDecide: boolean; canDecideSensitive: boolean; currentUserId: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-400">Nenhuma ação.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const action = ACTIONS[r.actionKey as keyof typeof ACTIONS];
        const sensitive = action?.sensitive ?? true;
        const blocked = sensitive && (!canDecideSensitive || r.proposedBy?.id === currentUserId);
        return (
          <li key={r.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{action?.label ?? r.actionKey}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS[r.status].style}`}>{STATUS[r.status].label}</span>
              {sensitive && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">Sensível</span>}
              {r.dryRun && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">Simulação</span>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
              {Object.entries((r.params ?? {}) as Record<string, string>).map(([k, v]) => (
                <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></Fragment>
              ))}
              <dt className="text-slate-500">Proposta por</dt>
              <dd>{r.proposedBy?.name ?? "Agente de execução"} · {formatDateTime(r.createdAt)}</dd>
              {r.ticket && (<><dt className="text-slate-500">Chamado</dt><dd><Link className="underline" href={`/chamados/${r.ticket.id}`}>{r.ticket.title}</Link></dd></>)}
              {r.reason && (<><dt className="text-slate-500">Motivo</dt><dd>{r.reason}</dd></>)}
              {r.decidedBy && (<><dt className="text-slate-500">Decidida por</dt><dd>{r.decidedBy.name}</dd></>)}
              {r.result != null && (<><dt className="text-slate-500">Resultado</dt><dd className="break-all font-mono">{JSON.stringify(r.result).slice(0, 400)}</dd></>)}
            </dl>
            {r.status === "PROPOSED" && canDecide && (
              <div className="flex flex-wrap items-center gap-2">
                {blocked ? (
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {canDecideSensitive ? "Você propôs esta ação sensível: outra pessoa precisa confirmar." : "Ação sensível: confirmação de coordenador ou administrador."}
                  </span>
                ) : (
                  <ActionForm action={approveExecution.bind(null, r.id)} resetOnSuccess={false}><button className="btn-primary py-1.5">Confirmar e executar</button></ActionForm>
                )}
                <ActionForm action={rejectExecution.bind(null, r.id)} resetOnSuccess={false}><button className="btn">Rejeitar</button></ActionForm>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
