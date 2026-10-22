export type MemberOption = { id: string; name: string };
export type LabelOption = { id: string; name: string; color: string };

// Classes completas (não interpoladas) para o Tailwind encontrá-las no build.
export const LABEL_COLORS: Record<string, string> = {
  slate: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100",
};

export const LABEL_COLOR_NAMES: Record<string, string> = {
  slate: "Cinza", red: "Vermelho", amber: "Âmbar", green: "Verde", sky: "Azul", violet: "Violeta", pink: "Rosa",
};
