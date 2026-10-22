// Geração de CSV para exportações (planilhas em pt-BR abrem com BOM e vírgula).

export function csvCell(value: unknown): string {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "string" ? value : JSON.stringify(value);
  // Evita fórmulas ao abrir em planilhas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/** Resposta HTTP de download, com BOM para o Excel reconhecer UTF-8. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function exportFilename(prefix: string, ext: "csv" | "pdf", now = new Date()) {
  return `${prefix}-${now.toISOString().slice(0, 10)}.${ext}`;
}
