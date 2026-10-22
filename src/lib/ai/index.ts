import "server-only";
import { AnthropicProvider } from "./anthropic";
import { LocalProvider } from "./local";
import type { AiProvider } from "./types";

let provider: AiProvider | null = null;

/**
 * Provedor configurado: AI_PROVIDER=anthropic|local. Sem AI_PROVIDER, usa a
 * Anthropic quando ANTHROPIC_API_KEY existe e o provedor local caso contrário.
 */
export function getAiProvider(): AiProvider {
  if (provider) return provider;
  const choice = process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "local");
  provider = choice === "anthropic" ? new AnthropicProvider() : new LocalProvider();
  return provider;
}

/** Para testes. */
export function setAiProvider(p: AiProvider | null) {
  provider = p;
}

export * from "./types";
