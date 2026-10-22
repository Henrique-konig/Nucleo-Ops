// Cores de destaque de quadros e agentes. Classes completas (não interpoladas)
// para o Tailwind encontrá-las no build.

export type AccentStyle = { name: string; dot: string; soft: string; bar: string };

export const ACCENTS: Record<string, AccentStyle> = {
  brand: {
    name: "Índigo",
    dot: "bg-brand-500",
    soft: "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-900",
    bar: "from-brand-400 to-brand-600",
  },
  sky: {
    name: "Azul",
    dot: "bg-sky-500",
    soft: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900",
    bar: "from-sky-400 to-sky-600",
  },
  emerald: {
    name: "Verde",
    dot: "bg-emerald-500",
    soft: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
    bar: "from-emerald-400 to-emerald-600",
  },
  amber: {
    name: "Âmbar",
    dot: "bg-amber-500",
    soft: "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
    bar: "from-amber-400 to-amber-600",
  },
  rose: {
    name: "Rosa",
    dot: "bg-rose-500",
    soft: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
    bar: "from-rose-400 to-rose-600",
  },
  violet: {
    name: "Violeta",
    dot: "bg-violet-500",
    soft: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900",
    bar: "from-violet-400 to-violet-600",
  },
  slate: {
    name: "Cinza",
    dot: "bg-slate-500",
    soft: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
    bar: "from-slate-400 to-slate-600",
  },
};

export function accent(color: string | null | undefined): AccentStyle {
  return ACCENTS[color ?? ""] ?? ACCENTS.brand;
}
