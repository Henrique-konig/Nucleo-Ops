import "server-only";

// Embeddings para a busca semântica (Voyage AI, 1024 dimensões, como a coluna
// Document.embedding). Sem VOYAGE_API_KEY, a busca usa só texto completo.

const MODEL = process.env.EMBEDDINGS_MODEL ?? "voyage-3.5";
export const EMBEDDING_DIMENSIONS = 1024;

export function embeddingsEnabled() {
  return Boolean(process.env.VOYAGE_API_KEY);
}

export async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][] | null> {
  if (!embeddingsEnabled() || texts.length === 0) return null;
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType, output_dimension: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`Falha ao gerar embeddings (${res.status})`);
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Formato literal do pgvector: "[0.1,0.2,...]". */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
