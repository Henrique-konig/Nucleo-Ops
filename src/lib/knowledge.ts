import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAction } from "@/lib/audit";
import { assertCan } from "@/lib/permissions";
import { enqueue, PermanentJobError, type JobHandler } from "@/lib/jobs/queue";
import { embed, embeddingsEnabled, toVectorLiteral } from "@/lib/ai/embeddings";
import { NotFoundError, type Actor } from "@/lib/errors";
import type { Source } from "@/lib/ai/types";

// Base de conhecimento: documentos com data de validade, busca híbrida (vetorial
// quando há embeddings + texto completo em português) e chamados parecidos.

export const documentSchema = z.object({
  title: z.string().trim().min(3, "Título muito curto").max(200),
  content: z.string().trim().min(10, "Conteúdo muito curto").max(100_000),
  source: z.string().trim().max(500).optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
});

export async function listDocuments(actor: Actor, filter: { q?: string; expired?: boolean } = {}) {
  assertCan(actor.role, "board:view");
  return db.document.findMany({
    where: {
      teamId: actor.teamId,
      ...(filter.expired && { validUntil: { lt: new Date() } }),
      ...(filter.q && { OR: [{ title: { contains: filter.q, mode: "insensitive" } }, { content: { contains: filter.q, mode: "insensitive" } }] }),
    },
    select: { id: true, title: true, source: true, validUntil: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getDocument(actor: Actor, id: string) {
  assertCan(actor.role, "board:view");
  const doc = await db.document.findFirst({ where: { id, teamId: actor.teamId } });
  if (!doc) throw new NotFoundError("Documento");
  return doc;
}

export async function saveDocument(actor: Actor, id: string | null, input: z.input<typeof documentSchema>) {
  assertCan(actor.role, "kb:edit");
  const data = documentSchema.parse(input);
  return db.$transaction(async (tx) => {
    let doc;
    if (id) {
      const existing = await tx.document.findFirst({ where: { id, teamId: actor.teamId } });
      if (!existing) throw new NotFoundError("Documento");
      doc = await tx.document.update({ where: { id }, data: { ...data, source: data.source || null } });
    } else {
      doc = await tx.document.create({ data: { ...data, source: data.source || null, teamId: actor.teamId } });
    }
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: id ? "document.update" : "document.create", targetType: "document", targetId: doc.id,
      payload: { title: doc.title },
    });
    if (embeddingsEnabled()) {
      await enqueue(tx, { teamId: actor.teamId, type: "document.embed", payload: { documentId: doc.id, updatedAt: doc.updatedAt.toISOString() } });
    }
    return doc;
  });
}

export async function deleteDocument(actor: Actor, id: string) {
  assertCan(actor.role, "kb:edit");
  return db.$transaction(async (tx) => {
    const doc = await tx.document.findFirst({ where: { id, teamId: actor.teamId } });
    if (!doc) throw new NotFoundError("Documento");
    await tx.document.delete({ where: { id } });
    await recordAction(tx, {
      teamId: actor.teamId, userId: actor.id, type: "document.delete", targetType: "document", targetId: id, payload: { title: doc.title },
    });
  });
}

export const embedDocumentJob: JobHandler = async (job) => {
  const { documentId } = z.object({ documentId: z.string() }).parse(job.payload);
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new PermanentJobError("Documento removido");
  const [vector] = (await embed([`${doc.title}\n\n${doc.content}`.slice(0, 30_000)], "document")) ?? [];
  if (!vector) return;
  await db.$executeRaw`UPDATE "Document" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${doc.id}`;
};

/** Documentos mais relevantes para o texto. Documentos vencidos ficam de fora. */
export async function searchDocuments(teamId: string, text: string, limit = 5): Promise<Source[]> {
  const query = text.slice(0, 2000);
  const byId = new Map<string, Source & { score: number }>();

  const [vector] = (embeddingsEnabled() ? await embed([query], "query").catch(() => null) : null) ?? [];
  if (vector) {
    const rows = await db.$queryRaw<{ id: string; title: string; content: string; distance: number }[]>`
      SELECT id, title, content, embedding <=> ${toVectorLiteral(vector)}::vector AS distance
      FROM "Document"
      WHERE "teamId" = ${teamId} AND embedding IS NOT NULL AND ("validUntil" IS NULL OR "validUntil" >= now())
      ORDER BY distance LIMIT ${limit}`;
    for (const r of rows) if (r.distance < 0.7) byId.set(r.id, { type: "document", id: r.id, title: r.title, content: r.content, score: 1 - r.distance });
  }

  // Texto completo: qualquer termo relevante (OR), ordenado por relevância.
  const rows = await db.$queryRaw<{ id: string; title: string; content: string; rank: number }[]>`
    WITH q AS (
      SELECT to_tsquery('portuguese', string_agg(lexeme, ' | ')) AS query
      FROM unnest(to_tsvector('portuguese', ${query}))
    )
    SELECT d.id, d.title, d.content, ts_rank(to_tsvector('portuguese', d.title || ' ' || d.content), q.query) AS rank
    FROM "Document" d, q
    WHERE d."teamId" = ${teamId} AND q.query IS NOT NULL
      AND to_tsvector('portuguese', d.title || ' ' || d.content) @@ q.query
      AND (d."validUntil" IS NULL OR d."validUntil" >= now())
    ORDER BY rank DESC LIMIT ${limit}`;
  for (const r of rows) {
    const existing = byId.get(r.id);
    byId.set(r.id, { type: "document", id: r.id, title: r.title, content: r.content, score: (existing?.score ?? 0) + Number(r.rank) });
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...s }) => s);
}

/** Chamados resolvidos parecidos, com a última resposta da equipe como conteúdo. */
export async function searchSimilarTickets(teamId: string, text: string, excludeId?: string, limit = 3): Promise<Source[]> {
  const rows = await db.$queryRaw<{ id: string; title: string; description: string }[]>`
    WITH q AS (
      SELECT to_tsquery('portuguese', string_agg(lexeme, ' | ')) AS query
      FROM unnest(to_tsvector('portuguese', ${text.slice(0, 2000)}))
    )
    SELECT t.id, t.title, t.description
    FROM "Ticket" t, q
    WHERE t."teamId" = ${teamId} AND t.status IN ('RESOLVED', 'CLOSED') AND t.id <> ${excludeId ?? ""}
      AND q.query IS NOT NULL AND to_tsvector('portuguese', t.title || ' ' || t.description) @@ q.query
    ORDER BY ts_rank(to_tsvector('portuguese', t.title || ' ' || t.description), q.query) DESC
    LIMIT ${limit}`;
  if (rows.length === 0) return [];
  const replies = await db.message.findMany({
    where: { ticketId: { in: rows.map((r) => r.id) }, internal: false, author: { role: { in: ["TECHNICIAN", "COORDINATOR", "ADMIN"] } } },
    orderBy: { createdAt: "desc" },
    select: { ticketId: true, content: true },
  });
  return rows.map((r) => {
    const answer = replies.find((m) => m.ticketId === r.id)?.content;
    return { type: "ticket", id: r.id, title: r.title, content: `Problema: ${r.description}${answer ? `\nResposta da equipe: ${answer}` : ""}` };
  });
}
