// Posições fracionárias para colunas, cartões e itens de checklist.
// Mover um item só altera a posição dele: o novo valor fica entre os vizinhos.

const STEP = 1024;

/** Posição entre `before` e `after` (qualquer um pode faltar, nas pontas). */
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return STEP;
  if (before == null) return after! - STEP;
  if (after == null) return before + STEP;
  if (after <= before) throw new RangeError("`after` deve ser maior que `before`");
  return before + (after - before) / 2;
}

/**
 * Posição para inserir no índice `index` de uma lista já ordenada,
 * desconsiderando o próprio item (quando ele já está na lista).
 */
export function positionAt(sorted: readonly { id: string; position: number }[], index: number, movingId?: string): number {
  const others = movingId ? sorted.filter((item) => item.id !== movingId) : sorted;
  const clamped = Math.max(0, Math.min(index, others.length));
  return positionBetween(others[clamped - 1]?.position, others[clamped]?.position);
}

/** Verdadeiro quando o intervalo ficou pequeno demais e convém renumerar a lista. */
export function needsRebalance(sorted: readonly { position: number }[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position - sorted[i - 1].position < 1e-6) return true;
  }
  return false;
}

/** Posições espaçadas para renumerar uma lista na ordem atual. */
export function rebalanced<T extends { id: string }>(sorted: readonly T[]): { id: string; position: number }[] {
  return sorted.map((item, i) => ({ id: item.id, position: (i + 1) * STEP }));
}
