"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, BookOpen, Bot, ChevronsLeft, Search, FileText, Inbox, KanbanSquare, LogOut, Menu, Monitor, Moon,
  Settings, ShieldCheck, Sun, Ticket, X, Zap, type LucideIcon,
} from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { initials } from "@/lib/initials";
import { OPEN_PALETTE_EVENT } from "./command-palette";
import { NotificationBell } from "./notification-bell";

type Item = { href: string; label: string; group: NavGroup };

const ICONS: Record<string, LucideIcon> = {
  "/solicitante": Inbox,
  "/boards": KanbanSquare,
  "/chamados": Ticket,
  "/base": BookOpen,
  "/agentes": Bot,
  "/execucoes": Zap,
  "/indicadores": BarChart3,
  "/relatorios": FileText,
  "/auditoria": ShieldCheck,
  "/admin": Settings,
};

type Props = {
  items: Item[];
  user: { name: string; role: string };
  signOut: () => Promise<void>;
};

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_12px_-2px_rgb(95_80_228/0.5)]">
        <Activity className="size-4.5" strokeWidth={2.5} aria-hidden />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Plantão</span>}
    </span>
  );
}

export function Sidebar({ items, user, signOut }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Um só sino montado por vez (uma conexão de tempo real), conforme a largura da tela.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar") === "collapsed");
    } catch {}
  }, []);

  // Fecha a gaveta do celular ao trocar de página.
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });
  }

  const groups = items.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  const nav = (compact: boolean) => (
    <nav aria-label="Principal" className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
      <SearchButton compact={compact} />
      {Object.entries(groups).map(([group, groupItems]) => (
        <div key={group} className="space-y-1">
          {!compact && <p className="eyebrow px-2.5 pb-1">{group}</p>}
          {compact && <div className="mx-auto mb-2 h-px w-6 bg-slate-200 dark:bg-slate-800" aria-hidden />}
          <ul className="space-y-0.5">
            {groupItems.map((item) => {
              const Icon = ICONS[item.href] ?? KanbanSquare;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={compact ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 ${
                      compact ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-white text-slate-900 shadow-card ring-1 ring-slate-200/80 dark:bg-slate-800/80 dark:text-white dark:ring-slate-700/60"
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100"
                    }`}
                  >
                    {active && (
                      <span aria-hidden className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />
                    )}
                    <Icon
                      aria-hidden
                      className={`size-[18px] shrink-0 transition-colors ${active ? "text-brand-600 dark:text-brand-400" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"}`}
                    />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (compact: boolean) => (
    <div className="space-y-2 border-t border-slate-200/80 p-3 dark:border-slate-800">
      {!compact && <ThemeSwitch />}
      <div className={`flex items-center gap-2 ${compact ? "flex-col" : ""}`}>
        <Link
          href="/conta"
          title={compact ? `${user.name} · ${user.role}` : undefined}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-slate-200/50 dark:hover:bg-slate-800/60 ${compact ? "justify-center" : ""}`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-semibold text-slate-700 ring-2 ring-white dark:from-slate-700 dark:to-slate-800 dark:text-slate-200 dark:ring-slate-900">
            {initials(user.name)}
          </span>
          {!compact && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user.role}</span>
            </span>
          )}
        </Link>
        <form action={signOut}>
          <button type="submit" className="icon-btn" title="Sair" aria-label="Sair">
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Barra superior no celular */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 backdrop-blur-xl lg:hidden dark:border-slate-800 dark:bg-slate-950/80">
        <Link href="/" aria-label="Início"><Logo /></Link>
        <span className="flex items-center gap-1">
        {isDesktop === false && <NotificationBell align="right" />}
        <button className="icon-btn" aria-label="Buscar" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}>
          <Search className="size-5" aria-hidden />
        </button>
        <button className="icon-btn" aria-label="Abrir menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
          <Menu className="size-5" aria-hidden />
        </button>
        </span>
      </header>

      {/* Gaveta no celular */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-[slide-in_0.25s_cubic-bezier(0.2,0.8,0.2,1)_both] flex-col border-r border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <button className="icon-btn" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {nav(false)}
            {footer(false)}
          </aside>
        </div>
      )}

      {/* Barra lateral no computador */}
      <aside
        className={`sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-slate-200/80 bg-slate-100/60 transition-[width] duration-300 ease-out lg:flex dark:border-slate-800/80 dark:bg-slate-950 ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "justify-between px-5"}`}>
          <Link href="/" aria-label="Início" className="rounded-lg"><Logo compact={collapsed} /></Link>
          {!collapsed && (
            <div className="flex items-center gap-0.5">
              {isDesktop && <NotificationBell />}
              <button className="icon-btn size-7" onClick={toggleCollapsed} aria-label="Recolher menu" title="Recolher menu">
                <ChevronsLeft className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
        {collapsed && (
          <div className="mb-2 flex flex-col items-center gap-1">
            {isDesktop && <NotificationBell />}
            <button className="icon-btn size-7" onClick={toggleCollapsed} aria-label="Expandir menu" title="Expandir menu">
              <ChevronsLeft className="size-4 rotate-180" aria-hidden />
            </button>
          </div>
        )}
        {nav(collapsed)}
        {footer(collapsed)}
      </aside>
    </>
  );
}

function SearchButton({ compact }: { compact: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      title={compact ? "Buscar (Ctrl+K)" : undefined}
      aria-keyshortcuts="Control+K Meta+K"
      className={`flex w-full items-center gap-2.5 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-sm text-slate-500 shadow-card transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200 ${compact ? "justify-center" : ""}`}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      {compact ? <span className="sr-only">Buscar</span> : (
        <>
          <span className="flex-1 text-left">Buscar…</span>
          <kbd className="rounded border border-slate-200 px-1 font-sans text-[10px] dark:border-slate-700">{mac ? "⌘" : "Ctrl"} K</kbd>
        </>
      )}
    </button>
  );
}

const THEMES = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
] as const;

function ThemeSwitch() {
  const [theme, setTheme] = useState<string>("system");

  useEffect(() => {
    try {
      setTheme(localStorage.getItem("theme") ?? "system");
    } catch {}
  }, []);

  function choose(value: string) {
    setTheme(value);
    try {
      if (value === "system") {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("theme", value);
        document.documentElement.dataset.theme = value;
      }
    } catch {}
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-0.5 rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900">
      {THEMES.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition ${
            theme === value
              ? "bg-white text-slate-900 shadow-card dark:bg-slate-800 dark:text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
