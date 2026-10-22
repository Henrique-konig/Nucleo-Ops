import { Fragment } from "react";
import Link from "next/link";
import { ACTIONS } from "@/lib/execution/catalog";
import { ActionForm } from "@/components/tickets/action-form";
import { formatDateTime } from "@/components/tickets/badges";
import { approveExecution, rejectExecution } from "@/app/(app)/execucoes/actions";
import type { ExecutionStatus } from "@/generated/prisma/enums";

const STATUS: Record<ExecutionStatus, { label: string; style: string }> = {
  PROPOSED: { label: "Aguardando confirmação", style: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  APPROVED: { label: "Confirmada, executando", style: "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" },
  REJECTED: { label: "Rejeitada", style: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" },
  EXECUTED: { label: "Executada", style: "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300" },
  SIMULATED: { label: "Simulada", style: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  FAILED: { label: "Falhou", style: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" },
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
  if (rows.length === 0) return <p className="empty py-8">Nenhuma ação por aqui.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const action = ACTIONS[r.actionKey as keyof typeof ACTIONS];
        const sensitive = action?.sensitive ?? true;
        const blocked = sensitive && (!canDecideSensitive || r.proposedBy?.id === currentUserId);
        return (
          <li key={r.id} className="panel animate-rise space-y-3 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{action?.label ?? r.actionKey}</span>
              <span className={`badge ${STATUS[r.status].style}`}>{STATUS[r.status].label}</span>
              {sensitive && <span className="badge bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300">Sensível</span>}
              {r.dryRun && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Simulação</span>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {Object.entries((r.params ?? {}) as Record<string, string>).map(([k, v]) => (
                <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></Fragment>
              ))}
              <dt className="text-slate-500">Proposta por</dt>
              <dd>{r.proposedBy?.name ?? "Agente de execução"} · {formatDateTime(r.createdAt)}</dd>
              {r.ticket && (<><dt className="text-slate-500">Chamado</dt><dd><Link className="link" href={`/chamados/${r.ticket.id}`}>{r.ticket.title}</Link></dd></>)}
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
