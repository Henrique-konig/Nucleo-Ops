import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string | Buffer, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Comparação em tempo constante de duas strings. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Assinatura no formato "sha256=<hex>" (webhooks genéricos e GitHub). */
export function verifySha256Signature(secret: string, body: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  return safeEqual(header.slice(7), hmacSha256Hex(secret, body));
}

/** Assinatura do Slack: v0=hmac("v0:<timestamp>:<body>"), rejeitando pedidos com mais de 5 min. */
export function verifySlackSignature(signingSecret: string, body: string, timestamp: string | null, signature: string | null, now = Date.now()): boolean {
  if (!timestamp || !signature) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  return safeEqual(signature, `v0=${hmacSha256Hex(signingSecret, `v0:${timestamp}:${body}`)}`);
}

/** Webhook de saída do Teams: "HMAC <base64>" com a chave em base64. */
export function verifyTeamsSignature(secretBase64: string, body: string, header: string | null): boolean {
  if (!header?.startsWith("HMAC ")) return false;
  const expected = createHmac("sha256", Buffer.from(secretBase64, "base64")).update(body).digest("base64");
  return safeEqual(header.slice(5), expected);
}
