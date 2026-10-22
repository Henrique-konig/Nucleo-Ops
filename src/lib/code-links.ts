import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { enqueue } from "@/lib/jobs/queue";
import { getSystemUser } from "@/lib/tickets";
import { NotFoundError, type Actor } from "@/lib/errors";

// Vínculo de cartões com pull requests (GitHub) e merge requests (GitLab) — RF-12.
// Automático: o PR menciona o código do cartão (PLT-xxxxxxxx) no título, na
// descrição ou no nome do branch. Manual: colar o link no cartão.

const CODE = /PLT-([a-z0-9]{8})/gi;

export function cardCode(cardId: string) {
  return `PLT-${cardId.slice(-8)}`;
}

export function findCardCodes(...texts: (string | null | undefined)[]): string[] {
  const codes = new Set<string>();
  for (const text of texts) for (const m of (text ?? "").matchAll(CODE)) codes.add(m[1].toLowerCase());
  return [...codes];
}

export type PullRequestEvent = { provider: "github" | "gitlab"; url: string; title: string; state: string; texts: (string | null | undefined)[] };

/** Atualiza (ou cria) os vínculos dos cartões citados no PR/MR. */
export async function syncPullRequest(teamId: string, event: PullRequestEvent) {
  const codes = findCardCodes(event.title, ...event.texts);
  const linkedCards = await db.cardLink.findMany({ where: { url: event.url, card: { board: { teamId } } }, select: { cardId: true } });
  const cards = await db.card.findMany({
    where: {
      board: { teamId },
      OR: [...codes.map((c) => ({ id: { endsWith: c } })), { id: { in: linkedCards.map((l) => l.cardId) } }],
    },
    select: { id: true, boardId: true, title: true },
  });
  if (cards.length === 0) return 0;

  await db.$transaction(async (tx) => {
    const system = await getSystemUser(tx, teamId);
    for (const card of cards) {
      const previous = await tx.cardLink.findUnique({ where: { cardId_url: { cardId: card.id, url: event.url } } });
      await tx.cardLink.upsert({
        where: { cardId_url: { cardId: card.id, url: event.url } },
        update: { title: event.title, state: event.state },
        create: { cardId: card.id, provider: event.provider, url: event.url, title: event.title, state: event.state },
      });
      if (previous?.state === event.state) continue;
      await recordAction(tx, {
        teamId, userId: system.id, type: previous ? "card.link_update" : "card.link", targetType: "card", targetId: card.id,
        payload: { url: event.url, state: event.state },
      });
      if (event.state === "merged") {
        await enqueue(tx, { teamId, type: "notify.team", payload: { text: `PR integrado para o cartão "${card.title}": ${event.title}`, cardId: card.id } });
      }
    }
  });
  return cards.length;
}

const urlSchema = z.url("Link inválido").refine((u) => /^https:\/\/(github\.com|gitlab\.[^/]+|[^/]+)\/.+\/(pull|merge_requests)\/\d+/.test(u), "Use o link de um pull request ou merge request");

/** Vínculo manual pelo cartão. */
export async function linkCard(actor: Actor, cardId: string, url: string) {
  assertCan(actor.role, "card:edit");
  const valid = urlSchema.parse(url.trim());
  return db.$transaction(async (tx) => {
    const card = await tx.card.findFirst({ where: { id: cardId, board: { teamId: actor.teamId } } });
    if (!card) throw new NotFoundError("Cartão");
    await tx.cardLink.upsert({
      where: { cardId_url: { cardId, url: valid } },
      update: {},
      create: { cardId, url: valid, provider: valid.includes("/merge_requests/") ? "gitlab" : "github", state: "open" },
    });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "card.link", targetType: "card", targetId: cardId, payload: { url: valid } });
  });
}

export async function unlinkCard(actor: Actor, linkId: string) {
  assertCan(actor.role, "card:edit");
  return db.$transaction(async (tx) => {
    const link = await tx.cardLink.findFirst({ where: { id: linkId, card: { board: { teamId: actor.teamId } } } });
    if (!link) throw new NotFoundError("Vínculo");
    await tx.cardLink.delete({ where: { id: linkId } });
    await recordAction(tx, { teamId: actor.teamId, userId: actor.id, type: "card.unlink", targetType: "card", targetId: link.cardId, payload: { url: link.url } });
  });
}
