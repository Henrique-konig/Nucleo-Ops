export type MemberOption = { id: string; name: string };
export type LabelOption = { id: string; name: string; color: string };

// Cores do marcador de cada coluna, em sequência.
export const COLUMN_ACCENTS = ["bg-slate-400", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-pink-500"];

// Classes completas (não interpoladas) para o Tailwind encontrá-las no build.
export const LABEL_COLORS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
  red: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  pink: "bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
};

export const LABEL_COLOR_NAMES: Record<string, string> = {
  slate: "Cinza", red: "Vermelho", amber: "Âmbar", green: "Verde", sky: "Azul", violet: "Violeta", pink: "Rosa",
};

export type AgentOption = { id: string; name: string; role: string; color: string };
export type BoardOption = { id: string; name: string; color: string };
