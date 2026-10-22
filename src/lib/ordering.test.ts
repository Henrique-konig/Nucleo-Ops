import { describe, expect, it } from "vitest";
import { needsRebalance, positionAt, positionBetween, rebalanced } from "./ordering";

describe("positionBetween", () => {
  it("usa o passo padrão em lista vazia e nas pontas", () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(1024, null)).toBe(2048);
    expect(positionBetween(null, 1024)).toBe(0);
  });

  it("fica no meio dos vizinhos", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it("rejeita vizinhos fora de ordem", () => {
    expect(() => positionBetween(2048, 1024)).toThrow(RangeError);
  });
});

describe("positionAt", () => {
  const list = [
    { id: "a", position: 1024 },
    { id: "b", position: 2048 },
    { id: "c", position: 3072 },
  ];

  it("insere no início, no meio e no fim", () => {
    expect(positionAt(list, 0)).toBeLessThan(1024);
    expect(positionAt(list, 1)).toBe(1536);
    expect(positionAt(list, 3)).toBeGreaterThan(3072);
  });

  it("ignora o próprio item ao mover dentro da mesma lista", () => {
    // Mover "a" para depois de "b": entre b e c.
    expect(positionAt(list, 1, "a")).toBe(2560);
  });

  it("limita índices fora do intervalo", () => {
    expect(positionAt(list, 99)).toBe(4096);
  });
});

describe("rebalance", () => {
  it("detecta intervalos pequenos demais", () => {
    expect(needsRebalance([{ position: 1 }, { position: 1 + 1e-9 }])).toBe(true);
    expect(needsRebalance([{ position: 1 }, { position: 2 }])).toBe(false);
  });

  it("renumera mantendo a ordem", () => {
    expect(rebalanced([{ id: "x" }, { id: "y" }])).toEqual([
      { id: "x", position: 1024 },
      { id: "y", position: 2048 },
    ]);
  });

  it("aguenta muitas inserções no mesmo ponto antes de precisar renumerar", () => {
    let lo = 1024;
    const hi = 2048;
    let inserts = 0;
    while (!needsRebalance([{ position: lo }, { position: hi }])) {
      lo = positionBetween(lo, hi);
      inserts++;
    }
    expect(inserts).toBeGreaterThan(25);
  });
});
