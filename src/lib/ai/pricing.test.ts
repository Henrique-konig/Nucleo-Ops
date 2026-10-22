import { describe, expect, it } from "vitest";
import { costMicroUsd } from "./pricing";

describe("custo de IA", () => {
  it("calcula em milionésimos de dólar, com cache", () => {
    // 1.000 tokens de entrada a US$ 4/M + 500 de saída a US$ 20/M = US$ 0,014
    expect(costMicroUsd("claude-opus-5-5", { inputTokens: 1000, outputTokens: 500 })).toBe(14_000);
    expect(costMicroUsd("claude-opus-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1000 })).toBe(400);
    expect(costMicroUsd("claude-haiku-5-5", { inputTokens: 1000, outputTokens: 1000 })).toBe(600);
  });
});
