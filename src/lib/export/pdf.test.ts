import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pdfSafe, renderTablePdf, renderTextPdf, wrapText } from "./pdf";

describe("PDF", () => {
  it("mantém acentos do português e troca o que a fonte padrão não desenha", () => {
    expect(pdfSafe("Ação, câmbio, pão — “ok” …")).toBe("Ação, câmbio, pão — “ok” …");
    expect(pdfSafe("de → para ✓")).toBe("de -> para v");
    expect(pdfSafe("emoji 🚀 fim")).toBe("emoji ? fim");
    expect(pdfSafe("a\tb\r\nc")).toBe("a  b\nc");
  });

  it("quebra linhas pela largura e corta palavras longas", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("um texto com várias palavras para quebrar", font, 10, 60);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(60);
    const long = wrapText("x".repeat(200), font, 10, 50);
    expect(long.join("")).toBe("x".repeat(200));
  });

  it("gera tabela com várias páginas e documento de texto", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`#${i}`, `Chamado número ${i} com acentuação`, "Em aberto"]);
    const table = await renderTablePdf({ title: "Chamados", subtitle: "teste", columns: [{ header: "Nº", width: 1 }, { header: "Chamado", width: 4 }, { header: "Status", width: 2 }], rows });
    expect(Buffer.from(table.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(table)).getPageCount()).toBeGreaterThan(1);

    const empty = await renderTablePdf({ title: "Vazio", columns: [{ header: "A", width: 1 }], rows: [] });
    expect((await PDFDocument.load(empty)).getPageCount()).toBe(1);

    const text = await renderTextPdf({ title: "Relatório diário", markdown: "# Resumo\n- 3 chamados → resolvidos\n\nParágrafo **forte**." });
    expect((await PDFDocument.load(text)).getTitle()).toBe("Relatório diário");
  });
});
