// Preço por milhão de tokens (US$), para medir o custo por chamado.
// Leitura de cache custa 10% da entrada; escrita de cache, 125%.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

/** Custo em milionésimos de dólar. Modelo desconhecido usa o preço do Opus (estimativa conservadora). */
export function costMicroUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const micro =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    (usage.cacheReadTokens ?? 0) * price.input * 0.1 +
    (usage.cacheWriteTokens ?? 0) * price.input * 1.25;
  // US$ por milhão de tokens × tokens = milionésimos de dólar.
  return Math.round(micro);
}

/** Cotação usada para mostrar custos em reais (USD_BRL, padrão 5,40). */
export function usdToBrl(microUsd: number): number {
  const rate = Number(process.env.USD_BRL ?? "5.40");
  return (microUsd / 1_000_000) * rate;
}
