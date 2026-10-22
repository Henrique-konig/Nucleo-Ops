/** Esqueletos mostrados enquanto o servidor monta a página (loading.tsx). */

function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton h-4 w-72 max-w-full" />
    </div>
  );
}

export function PageSkeleton({ label = "Carregando…" }: { label?: string }) {
  return (
    <Loading label={label}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <HeaderSkeleton />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </Loading>
  );
}

export function TableSkeleton({ label = "Carregando lista…", rows = 8 }: { label?: string; rows?: number }) {
  return (
    <Loading label={label}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <HeaderSkeleton />
        <div className="skeleton h-14 rounded-xl" />
        <div className="table-wrap">
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="skeleton h-3 w-1/3" />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0 dark:border-slate-800/70">
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                <div className="skeleton h-3 w-32" />
              </div>
              <div className="skeleton hidden h-5 w-20 rounded-full sm:block" />
              <div className="skeleton hidden h-5 w-16 rounded-full md:block" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function BoardSkeleton() {
  const cardsPerColumn = [3, 2, 4, 1];
  return (
    <Loading label="Carregando quadro…">
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
        <div className="px-4 pt-6 pb-5 sm:px-6 lg:px-8 lg:pt-8">
          <HeaderSkeleton />
        </div>
        <div className="flex flex-1 gap-4 overflow-hidden px-4 pb-6 sm:px-6 lg:px-8">
          {cardsPerColumn.map((count, c) => (
            <div key={c} className="flex w-[85vw] max-w-[19rem] shrink-0 flex-col gap-2 rounded-2xl border border-slate-200/70 bg-slate-100/70 p-2.5 sm:w-[19rem] dark:border-slate-800/70 dark:bg-slate-900/40">
              <div className="skeleton mx-1 mt-1 mb-2 h-4 w-28" />
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
                  <div className="skeleton h-3 w-12 rounded-full" />
                  <div className="skeleton h-4" style={{ width: `${60 + ((c + i) * 13) % 35}%` }} />
                  <div className="flex justify-between">
                    <div className="skeleton h-3 w-16" />
                    <div className="skeleton size-6 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
