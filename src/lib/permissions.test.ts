import { describe, expect, it } from "vitest";
import { assertCan, can, describePermission, ForbiddenError, PERMISSIONS, type Permission } from "./permissions";

describe("permissões por papel", () => {
  it("solicitante só abre chamados", () => {
    expect(can("REQUESTER", "ticket:create")).toBe(true);
    expect(can("REQUESTER", "board:view")).toBe(false);
    expect(can("REQUESTER", "card:move")).toBe(false);
  });

  it("técnico move cartões mas não atribui responsáveis", () => {
    expect(can("TECHNICIAN", "card:move")).toBe(true);
    expect(can("TECHNICIAN", "card:assign")).toBe(false);
    expect(can("TECHNICIAN", "column:manage")).toBe(false);
  });

  it("coordenador atribui responsáveis e configura automações", () => {
    expect(can("COORDINATOR", "card:assign")).toBe(true);
    expect(can("COORDINATOR", "automation:configure")).toBe(true);
    expect(can("COORDINATOR", "user:manage")).toBe(false);
  });

  it("auditor lê tudo e não altera nada", () => {
    expect(can("AUDITOR", "board:view")).toBe(true);
    expect(can("AUDITOR", "audit:view")).toBe(true);
    for (const p of ["card:create", "card:edit", "card:move", "column:manage", "ticket:create"] as const) {
      expect(can("AUDITOR", p)).toBe(false);
    }
  });

  it("assertCan lança ForbiddenError", () => {
    expect(() => assertCan("AUDITOR", "card:move")).toThrow(ForbiddenError);
    expect(() => assertCan("ADMIN", "agent:manage")).not.toThrow();
  });

  it("só coordenador e administrador exportam chamados", () => {
    expect(can("ADMIN", "ticket:export")).toBe(true);
    expect(can("COORDINATOR", "ticket:export")).toBe(true);
    for (const r of ["TECHNICIAN", "REQUESTER", "AUDITOR"] as const) expect(can(r, "ticket:export")).toBe(false);
  });

  it("toda permissão tem nome legível na matriz de perfis", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(describePermission(p).group).not.toBe("Outras");
  });
});
