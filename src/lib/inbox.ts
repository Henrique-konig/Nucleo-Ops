import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/errors";

// Notificações dentro do Plantão (sino na barra lateral). Gravadas na mesma
// transação da mudança que as causou; o trigger do banco avisa o navegador.

type Tx = Prisma.TransactionClient;

export type NewNotification = {
  teamId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href: string;
  actorId?: string | null;
  cardId?: string | null;
  ticketId?: string | null;
};

/**
 * Notifica cada pessoa uma vez, só se for da equipe, estiver ativa e não for
 * quem fez a ação. Retorna os ids notificados.
 */
export async function notifyUsers(tx: Tx, userIds: (string | null | undefined)[], data: NewNotification): Promise<string[]> {
  const wanted = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== data.actorId))];
  if (wanted.length === 0) return [];
  const recipients = await tx.user.findMany({ where: { id: { in: wanted }, teamId: data.teamId, active: true }, select: { id: true } });
  if (recipients.length === 0) return [];
  await tx.notification.createMany({ data: recipients.map((r) => ({ ...data, userId: r.id })) });
  return recipients.map((r) => r.id);
}

export function cardHref(card: { id: string; boardId: string }) {
  return `/boards/${card.boardId}?cartao=${card.id}`;
}

/** Avisa quem passou a ser responsável pelo cartão. */
export function notifyAssigned(
  tx: Tx,
  card: { id: string; boardId: string; title: string; ticketId: string | null },
  assigneeId: string | null | undefined,
  teamId: string,
  actorId: string | null,
) {
  return notifyUsers(tx, [assigneeId], {
    teamId, actorId, type: "ASSIGNED", title: `Você é responsável por "${card.title}"`,
    href: cardHref(card), cardId: card.id, ticketId: card.ticketId,
  });
}

export async function listNotifications(actor: Actor, limit = 30) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { items, unread };
}

export type InboxData = Awaited<ReturnType<typeof listNotifications>>;

const markSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(100).optional() });

/** Marca como lidas as notificações indicadas, ou todas quando não há ids. */
export async function markNotificationsRead(actor: Actor, input: z.input<typeof markSchema>) {
  const { ids } = markSchema.parse(input);
  const { count } = await db.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(ids && { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return count;
}
