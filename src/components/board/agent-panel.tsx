"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Bot, Copy, Loader2, Sparkles } from "lucide-react";
import type { BoardCard } from "@/lib/boards";
import * as actions from "@/app/(app)/boards/[boardId]/actions";
import { SimpleMarkdown } from "@/components/ui/simple-markdown";
import { accent } from "@/components/ui/accent";
import type { AgentOption } from "./shared";

type Run = Extract<Awaited<ReturnType<typeof actions.cardAgentRuns>>, { ok: true }>["data"][number];

const STATUS = {
  QUEUED: "Na fila",
  RUNNING: "Trabalhando…",
  DONE: "Concluído",
  FAILED: "Falhou",
} as const;

const fmt = (d: Date | string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Agente no cartão: pedir uma análise e ver o histórico das execuções. */
export function AgentPanel({ card, agents, canRun, onResult }: {
  card: BoardCard;
  agents: AgentOption[];
  canRun: boolean;
  onResult: (r: actions.ActionResult<unknown>) => boolean;
}) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState(card.agent?.id ?? agents[0]?.id ?? "");
  const [copied, setCopied] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const result = await actions.cardAgentRuns(card.id);
    if (result.ok) setRuns(result.data);
  }, [card.id]);

  // Recarrega quando o quadro muda (o banco avisa ao terminar uma execução).
  useEffect(() => {
    void load();
  }, [load, card]);

  useEffect(() => setAgentId(card.agent?.id ?? agents[0]?.id ?? ""), [card.agent?.id, agents]);

  // Reserva caso o tempo real esteja fora: consulta enquanto houver execução em andamento.
  const busy = runs?.some((r) => r.status === "QUEUED" || r.status === "RUNNING");
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [busy, load]);

  if (agents.length === 0 && !card.agent && (runs?.length ?? 0) === 0) return null;

  return (
    <section aria-labelledby="agent-title" className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <h3 id="agent-title" className="field-label flex items-center gap-1.5"><Bot className="size-3.5" aria-hidden /> Agentes</h3>

      {canRun && agents.length > 0 && (
        <form
          ref={formRef}
          className="space-y-2"
          action={(fd) =>
            startTransition(async () => {
              const result = await actions.runAgent({ cardId: card.id, agentId, prompt: String(fd.get("prompt") ?? "") || undefined });
              if (onResult(result)) {
                formRef.current?.reset();
                await load();
              }
            })
          }
        >
          <div className="flex flex-wrap gap-2">
            <label className="min-w-40 flex-1">
              <span className="sr-only">Agente</span>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input py-1.5">
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.id === card.agent?.id ? " (atribuído)" : ""}</option>
                ))}
              </select>
            </label>
            <button className="btn-primary py-1.5" disabled={pending || !agentId}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Pedir ao agente
            </button>
          </div>
          <label className="block">
            <span className="sr-only">Pedido (opcional)</span>
            <textarea name="prompt" rows={2} maxLength={2000} className="input text-sm" placeholder="Pedido opcional: “escreva o passo a passo”, “avalie o risco”…" />
          </label>
        </form>
      )}

      {runs === null ? (
        <p className="text-xs text-slate-500">Carregando…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma execução ainda.</p>
      ) : (
        <ol className="space-y-2" aria-live="polite">
          {runs.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className={`badge ring-1 ${accent(r.agent.color).soft}`}><Bot className="size-3" aria-hidden /> {r.agent.name}</span>
                <span className={r.status === "FAILED" ? "font-medium text-red-600 dark:text-red-400" : r.status === "DONE" ? "" : "font-medium text-amber-600 dark:text-amber-400"}>
                  {(r.status === "QUEUED" || r.status === "RUNNING") && <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden />}
                  {STATUS[r.status]}
                </span>
                <span>· {fmt(r.createdAt)} · pedido por {r.requestedBy.name}</span>
                {r.output && (
                  <button
                    className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      void navigator.clipboard?.writeText(r.output!).then(() => {
                        setCopied(r.id);
                        setTimeout(() => setCopied(null), 1500);
                      });
                    }}
                  >
                    <Copy className="size-3" aria-hidden /> {copied === r.id ? "Copiado" : "Copiar"}
                  </button>
                )}
              </div>
              {r.prompt && <p className="mb-2 text-xs text-slate-500 italic dark:text-slate-400">“{r.prompt}”</p>}
              {r.output && <SimpleMarkdown content={r.output} />}
              {r.error && <p className="text-sm text-red-700 dark:text-red-300">{r.error}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
