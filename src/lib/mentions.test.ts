import { describe, expect, it } from "vitest";
import { mentionQuery, mentionToken, parseMentions, plainText, segments } from "./mentions";

describe("menções", () => {
  const text = `Oi ${mentionToken("Ana Lima", "u1")}, veja com ${mentionToken("Bruno", "u2")} e ${mentionToken("Ana Lima", "u1")}.`;

  it("extrai os ids sem repetir", () => {
    expect(parseMentions(text)).toEqual(["u1", "u2"]);
    expect(parseMentions("sem menções @ana")).toEqual([]);
  });

  it("divide o texto em trechos", () => {
    expect(segments(`a ${mentionToken("Ana", "u1")} b`)).toEqual([
      { type: "text", text: "a " },
      { type: "mention", name: "Ana", userId: "u1" },
      { type: "text", text: " b" },
    ]);
  });

  it("gera texto corrido e corta textos longos", () => {
    expect(plainText(text)).toBe("Oi @Ana Lima, veja com @Bruno e @Ana Lima.");
    expect(plainText("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });

  it("remove colchetes do nome no token", () => {
    expect(mentionToken("A [b]", "u1")).toBe("@[A b](u1)");
  });

  it("detecta a menção sendo digitada", () => {
    expect(mentionQuery("fala @an", 8)).toEqual({ start: 5, query: "an" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("email@dominio", 13)).toBeNull();
    expect(mentionQuery("fala @ana lima", 14)).toBeNull();
  });
});
