"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import type { InboxData } from "@/lib/inbox";
import { markNotificationsReadAction } from "@/app/(app)/notificacoes/actions";
import { NotificationList } from "./notification-bell";

export function NotificationsPage({ initial }: { initial: InboxData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);

  async function markRead(ids?: string[]) {
    setData((d) => ({
      unread: ids ? Math.max(0, d.unread - ids.length) : 0,
      items: d.items.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? new Date() } : i)),
    }));
    await markNotificationsReadAction(ids);
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-300">{data.unread === 0 ? "Nenhuma não lida" : `${data.unread} não ${data.unread === 1 ? "lida" : "lidas"}`}</p>
        {data.unread > 0 && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => markRead()}>
            <CheckCheck className="size-3.5" aria-hidden /> Marcar todas como lidas
          </button>
        )}
      </div>
      <NotificationList
        items={data.items}
        onFollow={(item) => {
          if (!item.readAt) markRead([item.id]);
          router.push(item.href);
        }}
      />
    </section>
  );
}
