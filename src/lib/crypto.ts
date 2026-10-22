import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Configurações de integração são cifradas (AES-256-GCM) antes de gravar no banco.
// Formato: v1:<iv>:<tag>:<dados>, tudo em base64.

function key(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) throw new Error("INTEGRATION_ENCRYPTION_KEY não definida");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY deve ter 32 bytes em base64");
  return buf;
}

export function encryptConfig(config: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

export function decryptConfig<T = unknown>(payload: string): T {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de configuração cifrada inválido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
