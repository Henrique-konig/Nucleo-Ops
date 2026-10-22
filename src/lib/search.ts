import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { STATUS_LABELS } from "@/lib/tickets";
import type { Actor } from "@/lib/errors";

// Busca global (Ctrl+K): cartões, chamados, quadros, documentos e agentes da
// equipe, respeitando o papel. Solicitantes só encontram os próprios chamados.

export type SearchHit = {
  type: "card" | "ticket" | "board" | "document" | "agent";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const PER_TYPE = 6;

export async function globalSearch(actor: Actor, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  // "#a1b2c3d4" procura pelo código curto do chamado.
  const code = /^#?([a-z0-9]{6,})$/i.exec(q)?.[1]?.toLowerCase();

  if (!can(actor.role, "board:view")) {
    const tickets = await db.ticket.findMany({
      where: { teamId: actor.teamId, requesterId: actor.id, OR: [{ title: contains }, ...(code ? [{ id: { endsWith: code } }] : [])] },
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: PER_TYPE,
    });
    return tickets.map((t) => ({ type: "ticket", id: t.id, title: t.title, subtitle: `#${t.id.slice(-8)} · ${STATUS_LABELS[t.status]}`, href: `/solicitante/chamados/${t.id}` }));
  }

  const [cards, tickets, boards, documents, agents] = await Promise.all([
    db.card.findMany({
      where: { board: { teamId: actor.teamId }, archivedAt: null, OR: [{ title: contains }, { description: contains }] },
      select: { id: true, title: true, boardId: true, board: { select: { name: true } }, column: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: PER_TYPE,
    }),
    db.ticket.findMany({
      where: {
        teamId: actor.teamId,
        OR: [{ title: contains }, { description: contains }, { requesterEmail: contains }, ...(code ? [{ id: { endsWith: code } }] : [])],
      },
      select: { id: true, title: true, status: true, requesterName: true, requesterEmail: true },
      orderBy: { updatedAt: "desc" },
      take: PER_TYPE,
    }),
    db.board.findMany({
      where: { teamId: actor.teamId, OR: [{ name: contains }, { description: contains }] },
      select: { id: true, name: true, description: true },
      take: PER_TYPE,
    }),
    db.document.findMany({
      where: { teamId: actor.teamId, OR: [{ title: contains }, { content: contains }] },
      select: { id: true, title: true, source: true },
      orderBy: { updatedAt: "desc" },
      take: PER_TYPE,
    }),
    db.customAgent.findMany({
      where: { teamId: actor.teamId, OR: [{ name: contains }, { role: contains }] },
      select: { id: true, name: true, role: true },
      take: PER_TYPE,
    }),
  ]);

  return [
    ...cards.map((c): SearchHit => ({ type: "card", id: c.id, title: c.title, subtitle: `${c.board.name} · ${c.column.name}`, href: `/boards/${c.boardId}?cartao=${c.id}` })),
    ...tickets.map((t): SearchHit => ({
      type: "ticket", id: t.id, title: t.title,
      subtitle: [`#${t.id.slice(-8)}`, STATUS_LABELS[t.status], t.requesterName ?? t.requesterEmail].filter(Boolean).join(" · "),
      href: `/chamados/${t.id}`,
    })),
    ...boards.map((b): SearchHit => ({ type: "board", id: b.id, title: b.name, subtitle: b.description ?? "Quadro", href: `/boards/${b.id}` })),
    ...documents.map((d): SearchHit => ({ type: "document", id: d.id, title: d.title, subtitle: d.source ?? "Base de conhecimento", href: `/base/${d.id}` })),
    ...agents.map((a): SearchHit => ({ type: "agent", id: a.id, title: a.name, subtitle: a.role, href: `/agentes/${a.id}` })),
  ];
}
