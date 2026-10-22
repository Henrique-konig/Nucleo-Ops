import { describe, expect, it } from "vitest";
import { csvCell, exportFilename, toCsv } from "./csv";

describe("CSV", () => {
  it("escapa aspas, neutraliza fórmulas e serializa datas e objetos", () => {
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell(null)).toBe('""');
    expect(csvCell(new Date("2026-10-22T12:00:00Z"))).toBe('"2026-10-22T12:00:00.000Z"');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("monta cabeçalho e linhas", () => {
    expect(toCsv(["a", "b"], [[1, "x"], [null, "y"]])).toBe('a,b\n"1","x"\n"","y"');
    expect(exportFilename("chamados", "pdf", new Date("2026-10-22T12:00:00Z"))).toBe("chamados-2026-10-22.pdf");
  });
});
