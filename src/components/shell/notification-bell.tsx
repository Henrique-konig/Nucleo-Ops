"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Bell, CheckCheck, MessageSquare, Ticket, UserCheck, type LucideIcon } from "lucide-react";
import type { InboxData } from "@/lib/inbox";
import { listNotificationsAction, markNotificationsReadAction } from "@/app/(app)/notificacoes/actions";
import { relativeTime } from "@/components/activity/activity-feed";

export const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  MENTION: AtSign,
  COMMENT: MessageSquare,
  ASSIGNED: UserCheck,
  TICKET_REPLY: Ticket,
};

/**
 * Sino de notificações: contador de não lidas, lista recente e aviso em tempo
 * real (SSE). Uma notificação nova aparece por alguns segundos num aviso flutuante.
 */
export function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const router = useRouter();
  const [data, setData] = useState<InboxData | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<InboxData["items"][number] | null>(null);
  const lastSeen = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (announce: boolean) => {
    const result = await listNotificationsAction();
    if (!result.ok) return;
    const newest = result.data.items[0];
    if (announce && newest && !newest.readAt && newest.id !== lastSeen.current) {
      setToast(newest);
    }
    lastSeen.current = newest?.id ?? null;
    setData(result.data);
  }, []);

  useEffect(() => {
    load(false);
    const source = new EventSource("/api/notifications/events");
    source.addEventListener("change", () => load(true));
    return () => source.close();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(ids?: string[]) {
    setData((d) => d && {
      unread: ids ? Math.max(0, d.unread - d.items.filter((i) => ids.includes(i.id) && !i.readAt).length) : 0,
      items: d.items.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? new Date() } : i)),
    });
    await markNotificationsReadAction(ids);
  }

  function follow(item: InboxData["items"][number]) {
    setOpen(false);
    setToast(null);
    if (!item.readAt) markRead([item.id]);
    router.push(item.href);
  }

  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        className="icon-btn relative"
        aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums ring-2 ring-slate-50 dark:ring-slate-950">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notificações"
          className={`absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift dark:border-slate-700 dark:bg-slate-900 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold">Notificações</p>
            {unread > 0 && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => markRead()}>
                <CheckCheck className="size-3.5" aria-hidden /> Marcar todas como lidas
              </button>
            )}
          </div>
          <NotificationList items={data?.items ?? null} onFollow={follow} />
          <Link href="/notificacoes" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-300 dark:hover:bg-slate-800/60">
            Ver todas
          </Link>
        </div>
      )}

      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] w-[min(22rem,calc(100vw-2rem))]">
        {toast && (
          <button
            onClick={() => follow(toast)}
            className="pointer-events-auto flex w-full animate-rise items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-lift dark:border-slate-700 dark:bg-slate-900"
          >
            <NotificationIcon type={toast.type} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{toast.title}</span>
              {toast.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">{toast.body}</span>}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationIcon({ type }: { type: string }) {
  const Icon = NOTIFICATION_ICONS[type] ?? Bell;
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
      <Icon className="size-4" />
    </span>
  );
}

export function NotificationList({ items, onFollow }: { items: InboxData["items"] | null; onFollow: (item: InboxData["items"][number]) => void }) {
  if (!items) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Carregando">
        {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
        <Bell className="size-6 text-slate-300 dark:text-slate-600" aria-hidden />
        Tudo em dia. Menções, atribuições e respostas de chamados aparecem aqui.
      </div>
    );
  }
  return (
    <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onFollow(item)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${item.readAt ? "" : "bg-brand-50/40 dark:bg-brand-950/20"}`}
          >
            <NotificationIcon type={item.type} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900 dark:text-white">{item.title}</span>
              {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">{item.body}</span>}
              <span className="mt-1 block text-[11px] text-slate-400">{relativeTime(item.createdAt)}</span>
            </span>
            {!item.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-label="Não lida" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
