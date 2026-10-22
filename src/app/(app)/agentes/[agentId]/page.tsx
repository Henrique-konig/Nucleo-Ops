import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { AgentForm, ConfirmSubmit } from "@/components/agents/agent-form";
import { ActionForm } from "@/components/tickets/action-form";
import { SimpleMarkdown } from "@/components/ui/simple-markdown";
import { accent } from "@/components/ui/accent";
import { getCustomAgent } from "@/lib/custom-agents";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { deleteAgentAction, updateAgentAction } from "../actions";

const STATUS = { QUEUED: "Na fila", RUNNING: "Trabalhando", DONE: "Concluído", FAILED: "Falhou" } as const;
const fmt = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

async function load(agentId: string) {
  const user = await requireUser("board:view");
  const agent = await getCustomAgent(user, agentId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return { user, agent };
}

export async function generateMetadata({ params }: PageProps<"/agentes/[agentId]">) {
  const { agentId } = await params;
  const { agent } = await load(agentId);
  return { title: agent.name };
}

export default async function AgentPage({ params }: PageProps<"/agentes/[agentId]">) {
  const { agentId } = await params;
  const { user, agent } = await load(agentId);
  const canEdit = can(user.role, "agent:create");
  const style = accent(agent.color);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <Link href="/agentes" className="link inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" aria-hidden /> Agentes</Link>
      <header className="flex animate-rise items-center gap-4">
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ${style.soft}`}><Bot className="size-7" aria-hidden /></span>
        <div className="min-w-0">
          <h1 className="page-title flex flex-wrap items-center gap-2">
            {agent.name}
            {!agent.active && <span className="badge bg-slate-100 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Desligado</span>}
          </h1>
          <p className="page-subtitle">{agent.role}</p>
        </div>
      </header>

      {canEdit ? (
        <section aria-labelledby="config-title" className="space-y-4">
          <h2 id="config-title" className="section-title">Configuração</h2>
          <AgentForm
            action={updateAgentAction.bind(null, agent.id)}
            initial={{
              name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color,
              runOnAssign: agent.runOnAssign, useKnowledge: agent.useKnowledge, active: agent.active,
            }}
            submitLabel="Salvar"
          />
        </section>
      ) : (
        <section aria-labelledby="instructions-title" className="panel space-y-2 p-5">
          <h2 id="instructions-title" className="section-title">Instruções</h2>
          <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{agent.instructions}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section aria-labelledby="cards-title" className="space-y-3">
          <h2 id="cards-title" className="section-title">Cartões com este agente</h2>
          {agent.cards.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum cartão. Abra um cartão no quadro e escolha este agente.</p>
          ) : (
            <ul className="panel divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {agent.cards.map((c) => (
                <li key={c.id}>
                  <Link href={`/boards/${c.boardId}?cartao=${c.id}`} className="block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{c.board.name} · {c.column.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="runs-title" className="space-y-3">
          <h2 id="runs-title" className="section-title">Execuções recentes</h2>
          {agent.runs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma execução ainda.</p>
          ) : (
            <ol className="space-y-2">
              {agent.runs.map((r) => (
                <li key={r.id}>
                  <details className="panel group p-4">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                      <span className={`badge ${r.status === "FAILED" ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" : r.status === "DONE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"}`}>
                        {STATUS[r.status]}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{r.card.title}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{fmt(r.createdAt)} · {r.requestedBy.name}</span>
                    </summary>
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {r.prompt && <p className="text-xs text-slate-500 italic">“{r.prompt}”</p>}
                      {r.output && <SimpleMarkdown content={r.output} />}
                      {r.error && <p className="text-sm text-red-700 dark:text-red-300">{r.error}</p>}
                      <Link href={`/boards/${r.card.boardId}?cartao=${r.card.id}`} className="link text-xs">Abrir cartão</Link>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {canEdit && (
        <section aria-labelledby="danger-title" className="space-y-2 border-t border-slate-200 pt-6 dark:border-slate-800">
          <h2 id="danger-title" className="section-title">Excluir agente</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Os cartões ficam sem agente e o histórico de execuções é apagado. O registro de auditoria permanece. Para só pausar, desmarque “Ativo”.</p>
          <ActionForm action={deleteAgentAction.bind(null, agent.id)}>
            <ConfirmSubmit className="btn-danger" message={`Excluir o agente ${agent.name}?`}>Excluir {agent.name}</ConfirmSubmit>
          </ActionForm>
        </section>
      )}
    </main>
  );
}
