import type { Breakdown } from "@/lib/metrics";

// Gráficos de uma série (sem legenda: o título nomeia a série). Cada marca tem
// dica ao passar o mouse ou focar, e cada gráfico tem a tabela com os números.

function DataTable({ rows, label, valueLabel }: { rows: Breakdown; label: string; valueLabel: string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Ver tabela</summary>
      <table className="mt-2 w-full">
        <thead><tr className="text-left text-slate-500"><th className="font-medium">{label}</th><th className="text-right font-medium">{valueLabel}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="text-right tabular-nums">{r.value}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

/** Barras horizontais: comparar magnitudes entre categorias. */
export function BarList({ title, rows, unit = "chamados", max = 8 }: { title: string; rows: Breakdown; unit?: string; max?: number }) {
  const shown = rows.length > max ? [...rows.slice(0, max - 1), { label: "Outros", value: rows.slice(max - 1).reduce((n, r) => n + r.value, 0) }] : rows;
  const top = Math.max(1, ...shown.map((r) => r.value));
  return (
    <figure className="panel animate-rise p-5">
      <figcaption className="mb-4 text-sm font-semibold">{title}</figcaption>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-800">Sem dados no período.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.label} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="truncate" title={r.label}>{r.label}</span>
              <span className="group relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800/70" role="img" tabIndex={0} aria-label={`${r.label}: ${r.value} ${unit}`}>
                <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: "var(--series-1)" }} />
                <span role="tooltip" className="pointer-events-none absolute -top-8 left-0 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lift group-hover:block group-focus:block dark:bg-slate-100 dark:text-slate-900">
                  {r.label}: {r.value} {unit}
                </span>
              </span>
              <span className="text-right tabular-nums text-slate-700 dark:text-slate-300">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      <DataTable rows={rows} label="Categoria" valueLabel={unit} />
    </figure>
  );
}

/** Colunas por dia: volume ao longo do tempo. */
export function DailyColumns({ title, rows }: { title: string; rows: Breakdown }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  // Rótulos seletivos no eixo: primeiro, meio e último dia.
  const labeled = new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]);
  return (
    <figure className="panel animate-rise p-5">
      <figcaption className="mb-4 flex items-baseline justify-between text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-slate-500">máx. {top} por dia</span>
      </figcaption>
      <div className="relative flex h-40 items-end gap-[2px] border-b" style={{ borderColor: "var(--chart-grid)" }}>
        {rows.map((r) => (
          <div key={r.label} className="group relative flex h-full flex-1 items-end" role="img" tabIndex={0} aria-label={`${fmt(r.label)}: ${r.value} chamados`}>
            <div className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-75" style={{ height: `${(r.value / top) * 100}%`, minHeight: r.value > 0 ? 2 : 0, background: "var(--series-1)" }} />
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lift group-hover:block group-focus:block dark:bg-slate-100 dark:text-slate-900">
              {fmt(r.label)}: {r.value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px]" style={{ color: "var(--chart-muted)" }}>
        {rows.map((r, i) => <span key={r.label} className="flex-1 text-center">{labeled.has(i) ? fmt(r.label) : ""}</span>)}
      </div>
      <DataTable rows={rows.map((r) => ({ label: fmt(r.label), value: r.value }))} label="Dia" valueLabel="chamados" />
    </figure>
  );
}

/** Indicador com meta: o texto diz se a meta foi atingida (nunca só a cor). */
export function StatTile({ label, value, detail, goal }: { label: string; value: string; detail?: string; goal?: { text: string; met: boolean | null } }) {
  return (
    <div className="panel panel-hover flex animate-rise flex-col p-5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
      {goal && (
        <p
          className={`mt-auto flex items-start gap-1.5 pt-3 text-xs ${
            goal.met == null ? "text-slate-500 dark:text-slate-400" : goal.met ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
            goal.met == null ? "bg-slate-100 dark:bg-slate-800" : goal.met ? "bg-emerald-100 dark:bg-emerald-950" : "bg-red-100 dark:bg-red-950"
          }`}>{goal.met == null ? "·" : goal.met ? "✓" : "✗"}</span>
          <span>{goal.text}
          <span className="sr-only">{goal.met == null ? " (sem dados)" : goal.met ? " (meta atingida)" : " (meta não atingida)"}</span></span>
        </p>
      )}
    </div>
  );
}
