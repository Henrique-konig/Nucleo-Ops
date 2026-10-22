import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  pages: number;
  total: number;
  /** Monta o endereço de uma página mantendo os filtros atuais. */
  href: (page: number) => string;
  noun?: [singular: string, plural: string];
};

/** Navegação entre páginas de uma lista, com o total de itens. */
export function Pagination({ page, pages, total, href, noun = ["item", "itens"] }: Props) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-slate-500 dark:text-slate-400" aria-live="polite">
        Página {page} de {pages} · {total} {total === 1 ? noun[0] : noun[1]}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link className="btn" href={href(page - 1)} rel="prev"><ChevronLeft className="size-4" aria-hidden /> Anterior</Link>
        ) : (
          <span className="btn pointer-events-none opacity-50" aria-disabled="true"><ChevronLeft className="size-4" aria-hidden /> Anterior</span>
        )}
        {page < pages ? (
          <Link className="btn" href={href(page + 1)} rel="next">Próxima <ChevronRight className="size-4" aria-hidden /></Link>
        ) : (
          <span className="btn pointer-events-none opacity-50" aria-disabled="true">Próxima <ChevronRight className="size-4" aria-hidden /></span>
        )}
      </span>
    </nav>
  );
}

/** Endereço com os parâmetros atuais e a página trocada (página 1 sai da URL). */
export function pageHref(path: string, params: Record<string, string | undefined>, page: number) {
  const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "page") as [string, string][]);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
