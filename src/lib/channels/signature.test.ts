import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, verifySha256Signature, verifySlackSignature, verifyTeamsSignature } from "./signature";

describe("assinaturas de webhooks", () => {
  it("sha256= (webhook genérico e GitHub)", () => {
    const body = '{"a":1}';
    expect(verifySha256Signature("segredo", body, `sha256=${hmacSha256Hex("segredo", body)}`)).toBe(true);
    expect(verifySha256Signature("segredo", body, `sha256=${hmacSha256Hex("outro", body)}`)).toBe(false);
    expect(verifySha256Signature("segredo", body, null)).toBe(false);
  });

  it("Slack, com janela de 5 minutos", () => {
    const now = 1_800_000_000_000;
    const ts = String(now / 1000);
    const sig = `v0=${hmacSha256Hex("s3cret", `v0:${ts}:text=oi`)}`;
    expect(verifySlackSignature("s3cret", "text=oi", ts, sig, now)).toBe(true);
    expect(verifySlackSignature("s3cret", "text=oi", ts, sig, now + 10 * 60_000)).toBe(false);
    expect(verifySlackSignature("s3cret", "text=outro", ts, sig, now)).toBe(false);
  });

  it("Teams (HMAC base64)", () => {
    const key = Buffer.from("chave-teams").toString("base64");
    const body = '{"text":"status"}';
    const sig = createHmac("sha256", Buffer.from(key, "base64")).update(body).digest("base64");
    expect(verifyTeamsSignature(key, body, `HMAC ${sig}`)).toBe(true);
    expect(verifyTeamsSignature(key, body, `HMAC x${sig}`)).toBe(false);
  });
});
