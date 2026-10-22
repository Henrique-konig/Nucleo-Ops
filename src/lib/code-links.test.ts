import { describe, expect, it } from "vitest";
import { cardCode, findCardCodes } from "./code-links";

describe("códigos de cartão em PRs", () => {
  it("encontra códigos no título, corpo e branch, sem repetir", () => {
    expect(cardCode("cmabcdefgh12345678")).toBe("PLT-12345678");
    expect(findCardCodes("Corrige VPN (PLT-ab12cd34)", "Relacionado a plt-AB12CD34 e PLT-zz99yy88", "feature/PLT-ab12cd34-vpn")).toEqual(["ab12cd34", "zz99yy88"]);
    expect(findCardCodes("sem código", null, undefined)).toEqual([]);
  });
});
