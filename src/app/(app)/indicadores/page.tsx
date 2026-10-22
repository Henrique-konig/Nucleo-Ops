import Link from "next/link";
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
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Indicadores</h1>
        <nav aria-label="Período" className="flex gap-1 rounded-md border border-slate-200 p-0.5 text-sm dark:border-slate-800">
          {RANGES.map((d) => (
            <Link key={d} href={`/indicadores?dias=${d}`} aria-current={d === days ? "page" : undefined} className={`rounded px-3 py-1 ${d === days ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              {d} dias
            </Link>
          ))}
        </nav>
      </div>

      {data.baseline && !data.baseline.metrics && (
        <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">
          A linha de base está sendo medida na primeira semana de uso (até {data.baseline.period.to.toLocaleDateString("pt-BR")}). As metas de redução usam esses valores.
        </p>
      )}

      <section aria-label="Métricas de sucesso" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
