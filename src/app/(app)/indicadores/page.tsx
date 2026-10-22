import Link from "next/link";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/session";
import { dashboard, TARGETS, type Metrics } from "@/lib/metrics";
import { BarList, DailyColumns, StatTile } from "@/components/metrics/charts";

export const metadata = { title: "Indicadores" };

const RANGES = [7, 30, 90] as const;

function duration(min: number | null) {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${(min / 60).toFixed(1).replace(".", ",")} h`;
  return `${(min / 1440).toFixed(1).replace(".", ",")} dias`;
}

const brl = (v: number | null) => (v == null ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`);
const pct = (v: number | null) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);

/** Meta de redução em relação à linha de base (primeira semana). */
function reductionGoal(current: number | null, base: number | null | undefined, reduction: number) {
  if (base == null) return { text: `Meta: −${reduction * 100}% sobre a 1ª semana (linha de base em medição)`, met: null };
  const target = Math.round(base * (1 - reduction));
  return { text: `Meta: até ${duration(target)} (linha de base ${duration(base)})`, met: current == null ? null : current <= target };
}

export default async function MetricsPage({ searchParams }: PageProps<"/indicadores">) {
  const user = await requireUser("metrics:view");
  const { dias } = await searchParams;
  const days = RANGES.find((d) => String(d) === dias) ?? 30;
  const data = await dashboard(user, days);
  const m: Metrics = data.current;
  const base = data.baseline?.metrics;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Indicadores"
        description={`Desempenho da equipe e dos agentes nos últimos ${days} dias.`}
        actions={
          <nav aria-label="Período" className="flex gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 text-sm dark:border-slate-800 dark:bg-slate-900/60">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/indicadores?dias=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition ${d === days ? "bg-white text-slate-900 shadow-card dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                {d} dias
              </Link>
            ))}
          </nav>
        }
      />

      {data.baseline && !data.baseline.metrics && (
        <p className="flex items-start gap-2.5 rounded-xl border border-brand-200/70 bg-brand-50/70 p-3.5 text-sm text-brand-900 dark:border-brand-900/60 dark:bg-brand-950/30 dark:text-brand-100">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
          A linha de base está sendo medida na primeira semana de uso (até {data.baseline.period.to.toLocaleDateString("pt-BR")}). As metas de redução usam esses valores.
        </p>
      )}

      <section aria-label="Métricas de sucesso" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Tempo médio de primeira resposta" value={duration(m.avgFirstResponseMin)} goal={reductionGoal(m.avgFirstResponseMin, base?.avgFirstResponseMin, TARGETS.firstResponseReduction)} />
        <StatTile label="Tempo médio de resolução" value={duration(m.avgResolutionMin)} detail="Chamados resolvidos por pessoas" goal={reductionGoal(m.avgResolutionMin, base?.avgResolutionMin, TARGETS.resolutionReduction)} />
        <StatTile
          label="Conversas resolvidas pelo chatbot"
          value={pct(m.chatbotFirstLevelPct)}
          goal={{ text: `Meta: ${TARGETS.chatbotFirstLevelPct}% do primeiro nível`, met: m.chatbotFirstLevelPct == null ? null : m.chatbotFirstLevelPct >= TARGETS.chatbotFirstLevelPct }}
        />
        <StatTile
          label="Chamados triados automaticamente"
          value={pct(m.triagedPct)}
          goal={{ text: `Meta: ${TARGETS.triagedPct}%`, met: m.triagedPct == null ? null : m.triagedPct >= TARGETS.triagedPct }}
        />
        <StatTile
          label="Satisfação do solicitante"
          value={m.satisfaction == null ? "—" : `${String(m.satisfaction).replace(".", ",")} de 5`}
          detail={`${m.satisfactionCount} avaliações`}
          goal={{ text: `Meta: média acima de ${TARGETS.satisfaction}`, met: m.satisfaction == null ? null : m.satisfaction > TARGETS.satisfaction }}
        />
        <StatTile
          label="Custo de IA por chamado"
          value={brl(m.aiCostPerTicketBrl)}
          detail={`Total no período: ${brl(m.aiCostBrl)}`}
          goal={{ text: `Meta: abaixo de ${brl(TARGETS.aiCostPerTicketBrl)}`, met: m.aiCostPerTicketBrl == null ? null : m.aiCostPerTicketBrl < TARGETS.aiCostPerTicketBrl }}
        />
        <StatTile label="Chamados na fila" value={String(m.tickets)} detail={`${m.resolved} resolvidos no período`} />
        <StatTile label="Resolvidos sem intervenção humana" value={pct(m.resolvedByAgentPct)} detail="Entre todos os resolvidos" />
      </section>

      <DailyColumns title="Chamados por dia" rows={data.perDay} />

      <div className="grid gap-4 lg:grid-cols-3">
        <BarList title="Por categoria" rows={data.byCategory} />
        <BarList title="Por responsável" rows={data.byAssignee} />
        <BarList title="Por canal de entrada" rows={data.byChannel} />
      </div>
    </main>
  );
}
