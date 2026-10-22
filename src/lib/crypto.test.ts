import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptConfig, encryptConfig } from "./crypto";

beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("cifragem das configurações de integração", () => {
  it("cifra e decifra", () => {
    const config = { token: "xoxb-segredo", channel: "#ti" };
    const sealed = encryptConfig(config);
    expect(sealed).not.toContain("segredo");
    expect(decryptConfig(sealed)).toEqual(config);
  });

  it("usa IV aleatório", () => {
    expect(encryptConfig({ a: 1 })).not.toBe(encryptConfig({ a: 1 }));
  });

  it("rejeita dados adulterados", () => {
    const [v, iv, tag, data] = encryptConfig({ a: 1 }).split(":");
    const tampered = Buffer.from(data, "base64");
    tampered[0] ^= 1;
    expect(() => decryptConfig([v, iv, tag, tampered.toString("base64")].join(":"))).toThrow();
  });
});
