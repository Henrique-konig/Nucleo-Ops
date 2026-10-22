import Link from "next/link";
import { ArrowRight, Bot, Plus, Settings2 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { accent } from "@/components/ui/accent";
import { listCustomAgents } from "@/lib/custom-agents";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Agentes" };

export default async function AgentsPage() {
  const user = await requireUser("board:view");
  const agents = await listCustomAgents(user);
  const canCreate = can(user.role, "agent:create");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Agentes"
        description="Agentes criados pela equipe, cada um com uma função e instruções próprias. Atribua um agente a um cartão e ele deixa a análise lá."
        actions={
          <>
            {can(user.role, "agent:manage") && (
              <Link href="/admin/agentes" className="btn"><Settings2 className="size-4" aria-hidden /> Agentes do sistema</Link>
            )}
            {canCreate && <Link href="/agentes/novo" className="btn-primary"><Plus className="size-4" aria-hidden /> Novo agente</Link>}
          </>
        }
      />
      {agents.length === 0 ? (
        <EmptyState icon={<Bot className="size-5" />} title="Nenhum agente criado">
          {canCreate ? (
            <>Crie um agente a partir de um modelo, como <em>Analista de incidentes</em> ou <em>Redator de respostas</em>, e atribua aos cartões.</>
          ) : (
            "Peça a um coordenador para criar o primeiro agente da equipe."
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((a, i) => {
            const style = accent(a.color);
            return (
              <li key={a.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <Link href={`/agentes/${a.id}`} className={`panel panel-hover group flex h-full flex-col gap-4 p-5 ${a.active ? "" : "opacity-70"}`}>
                  <span className="flex items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 ${style.soft}`}><Bot className="size-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{a.name}</span>
                        {!a.active && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Desligado</span>}
                      </span>
                      <span className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{a.role}</span>
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span><strong className="font-semibold text-slate-800 dark:text-slate-100">{a.openCards}</strong> {a.openCards === 1 ? "cartão" : "cartões"}</span>
                    <span><strong className="font-semibold text-slate-800 dark:text-slate-100">{a.runsLastWeek}</strong> execuções em 7 dias</span>
                    {a.failuresLastWeek > 0 && <span className="text-red-600 dark:text-red-400">{a.failuresLastWeek} com falha</span>}
                    <span>{a.runOnAssign ? "Automático" : "Sob demanda"}</span>
                    <ArrowRight className="ml-auto size-4 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
