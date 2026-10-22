import type { ReactNode } from "react";

/** Cabeçalho padrão das páginas: título, descrição opcional e ações à direita. */
export function PageHeader({ title, description, actions, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        <h1 id={id} className="page-title">{title}</h1>
        {description && <p className="page-subtitle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Estado vazio com ícone, título e texto de apoio. */
export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && (
        <span className="mb-1 grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
          {icon}
        </span>
      )}
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {children && <div className="max-w-sm">{children}</div>}
    </div>
  );
}
