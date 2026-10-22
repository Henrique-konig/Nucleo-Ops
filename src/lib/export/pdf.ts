import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// PDFs gerados no servidor, sem navegador: tabelas (chamados, auditoria) e
// documentos de texto (relatórios). Usa as fontes padrão do PDF (WinAnsi), que
// cobrem os acentos do português; o resto é trocado por equivalentes simples.

const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = { "→": "->", "←": "<-", "✓": "v", "✔": "v", "✗": "x", "≥": ">=", "≤": "<=", " ": " " };

/** Deixa o texto só com caracteres que as fontes padrão do PDF conseguem desenhar. */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ")) {
    const code = ch.codePointAt(0)!;
    if (ch === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || WIN_ANSI_EXTRAS.has(ch)) out += ch;
    else if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch];
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && base !== ch && [...base].every((c) => c.charCodeAt(0) < 0x7f) ? base : code < 0x20 ? "" : "?";
    }
  }
  return out;
}

/** Quebra o texto em linhas que cabem na largura dada. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palavra maior que a linha (URLs, ids): corta em pedaços.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxWidth) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.4, 0.45, 0.53);
const RULE = rgb(0.85, 0.87, 0.9);
const HEAD_BG = rgb(0.94, 0.95, 0.97);
const ZEBRA = rgb(0.98, 0.98, 0.99);
const MARGIN = 36;

type Fonts = { regular: PDFFont; bold: PDFFont };

async function newDocument(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(title));
  doc.setProducer("Plantão");
  doc.setCreator("Plantão");
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  return { doc, fonts };
}

function drawHeader(page: PDFPage, fonts: Fonts, title: string, subtitle: string | undefined): number {
  const { height } = page.getSize();
  let y = height - MARGIN - 14;
  page.drawText(pdfSafe(title), { x: MARGIN, y, size: 16, font: fonts.bold, color: INK });
  if (subtitle) {
    y -= 16;
    page.drawText(pdfSafe(subtitle), { x: MARGIN, y, size: 9, font: fonts.regular, color: MUTED });
  }
  return y - 18;
}

function drawFooters(doc: PDFDocument, fonts: Fonts, generatedAt: string) {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = pdfSafe(`Plantão · gerado em ${generatedAt} · página ${i + 1} de ${pages.length}`);
    page.drawText(text, { x: width - MARGIN - fonts.regular.widthOfTextAtSize(text, 7.5), y: MARGIN / 2, size: 7.5, font: fonts.regular, color: MUTED });
  });
}

function generatedAtLabel(now: Date) {
  return now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export type PdfColumn = { header: string; width: number };

export type TablePdf = {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: string[][];
  /** Máximo de linhas por célula; o excedente vira "…". */
  maxCellLines?: number;
  now?: Date;
};

/** Tabela em A4 paisagem, com cabeçalho repetido a cada página. Larguras são relativas. */
export async function renderTablePdf(input: TablePdf): Promise<Uint8Array> {
  const { doc, fonts } = await newDocument(input.title);
  const pageSize: [number, number] = [841.89, 595.28];
  const size = 8;
  const lineHeight = 10;
  const pad = 4;
  const maxLines = input.maxCellLines ?? 6;
  const usable = pageSize[0] - MARGIN * 2;
  const total = input.columns.reduce((s, c) => s + c.width, 0);
  const widths = input.columns.map((c) => (c.width / total) * usable);

  const cellLines = (text: string, i: number, font: PDFFont) => {
    const lines = wrapText(text, font, size, widths[i] - pad * 2);
    return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`] : lines;
  };

  const drawRow = (page: PDFPage, y: number, cells: string[][], font: PDFFont, bg?: ReturnType<typeof rgb>) => {
    const h = Math.max(...cells.map((c) => c.length)) * lineHeight + pad * 2;
    if (bg) page.drawRectangle({ x: MARGIN, y: y - h, width: usable, height: h, color: bg });
    let x = MARGIN;
    cells.forEach((lines, i) => {
      lines.forEach((line, j) => page.drawText(line, { x: x + pad, y: y - pad - (j + 1) * lineHeight + 2, size, font, color: INK }));
      x += widths[i];
    });
    page.drawLine({ start: { x: MARGIN, y: y - h }, end: { x: MARGIN + usable, y: y - h }, thickness: 0.5, color: RULE });
    return y - h;
  };

  const headerCells = input.columns.map((c, i) => cellLines(c.header, i, fonts.bold));
  let page = doc.addPage(pageSize);
  let y = drawRow(page, drawHeader(page, fonts, input.title, input.subtitle), headerCells, fonts.bold, HEAD_BG);

  if (input.rows.length === 0) {
    page.drawText("Nenhum registro encontrado com esses filtros.", { x: MARGIN, y: y - 18, size: 10, font: fonts.regular, color: MUTED });
  }
  input.rows.forEach((row, r) => {
    const cells = row.map((text, i) => cellLines(text ?? "", i, fonts.regular));
    const h = Math.max(...cells.map((c) => c.length)) * lineHeight + pad * 2;
    if (y - h < MARGIN + 6) {
      page = doc.addPage(pageSize);
      y = drawRow(page, pageSize[1] - MARGIN, headerCells, fonts.bold, HEAD_BG);
    }
    y = drawRow(page, y, cells, fonts.regular, r % 2 ? ZEBRA : undefined);
  });

  drawFooters(doc, fonts, generatedAtLabel(input.now ?? new Date()));
  return doc.save();
}

export type TextPdf = {
  title: string;
  subtitle?: string;
  /** Markdown simples: títulos (#), tópicos (- ou *) e parágrafos. */
  markdown: string;
  now?: Date;
};

/** Documento de texto em A4 retrato (relatórios). */
export async function renderTextPdf(input: TextPdf): Promise<Uint8Array> {
  const { doc, fonts } = await newDocument(input.title);
  const pageSize: [number, number] = [595.28, 841.89];
  const usable = pageSize[0] - MARGIN * 2;
  let page = doc.addPage(pageSize);
  let y = drawHeader(page, fonts, input.title, input.subtitle);

  const ensure = (h: number) => {
    if (y - h < MARGIN + 6) {
      page = doc.addPage(pageSize);
      y = pageSize[1] - MARGIN;
    }
  };

  for (const raw of input.markdown.split("\n")) {
    const line = raw.replace(/\*\*/g, "").trimEnd();
    if (!line.trim()) {
      y -= 6;
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const lines = wrapText(line.replace(/^#+\s*/, ""), fonts.bold, 12, usable);
      ensure(lines.length * 16 + 8);
      y -= 6;
      for (const l of lines) {
        page.drawText(l, { x: MARGIN, y: y - 12, size: 12, font: fonts.bold, color: INK });
        y -= 16;
      }
      continue;
    }
    const bullet = /^\s*[-•*]\s/.test(line);
    const text = bullet ? line.replace(/^\s*[-•*]\s/, "") : line;
    const indent = bullet ? 14 : 0;
    const lines = wrapText(text, fonts.regular, 10, usable - indent);
    lines.forEach((l, i) => {
      ensure(14);
      if (bullet && i === 0) page.drawText("•", { x: MARGIN + 3, y: y - 10, size: 10, font: fonts.regular, color: MUTED });
      page.drawText(l, { x: MARGIN + indent, y: y - 10, size: 10, font: fonts.regular, color: INK });
      y -= 14;
    });
  }

  drawFooters(doc, fonts, generatedAtLabel(input.now ?? new Date()));
  return doc.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
