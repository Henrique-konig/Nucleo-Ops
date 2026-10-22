"use server";

import { runAction } from "@/lib/action-result";
import { listNotifications, markNotificationsRead } from "@/lib/inbox";

export async function listNotificationsAction() {
  return runAction((a) => listNotifications(a, 20));
}

export async function markNotificationsReadAction(ids?: string[]) {
  return runAction((a) => markNotificationsRead(a, { ids }), ["/notificacoes"]);
}
