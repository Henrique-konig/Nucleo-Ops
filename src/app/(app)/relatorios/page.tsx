import { requireUser } from "@/lib/session";
import { listReports } from "@/lib/agents/summary";
import { ActionForm } from "@/components/tickets/action-form";
import { requestReportAction } from "./actions";

export const metadata = { title: "Relatórios" };

const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Markdown simples do relatório: títulos, tópicos e parágrafos. */
function ReportBody({ content }: { content: string }) {
  const blocks: ({ kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "p"; text: string })[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\*\*/g, "").trimEnd();
    const last = blocks.at(-1);
    if (!line.trim()) blocks.push({ kind: "p", text: "" });
    else if (/^#{1,6}\s/.test(line)) blocks.push({ kind: "h", text: line.replace(/^#+\s*/, "") });
    else if (/^\s*[-•*]\s/.test(line)) {
      const item = line.replace(/^\s*[-•*]\s/, "");
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (last?.kind === "p" && last.text) last.text += `\n${line}`;
    else blocks.push({ kind: "p", text: line });
  }
  return (
    <div className="space-y-2 text-sm">
      {blocks.map((b, i) =>
        b.kind === "h" ? <h3 key={i} className="font-semibold">{b.text}</h3>
        : b.kind === "ul" ? <ul key={i} className="list-disc pl-5">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        : b.text ? <p key={i} className="whitespace-pre-wrap">{b.text}</p> : null,
      )}
    </div>
  );
}

export default async function ReportsPage() {
  const user = await requireUser("metrics:view");
  const reports = await listReports(user);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Relatórios</h1>
        <div className="flex gap-2">
          <ActionForm action={requestReportAction.bind(null, "DAILY")} resetOnSuccess={false} successMessage="Gerando o relatório de ontem…"><button className="btn">Gerar diário</button></ActionForm>
          <ActionForm action={requestReportAction.bind(null, "WEEKLY")} resetOnSuccess={false} successMessage="Gerando o relatório da semana passada…"><button className="btn">Gerar semanal</button></ActionForm>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">Gerados pelo agente de resumo todo dia de manhã e às segundas (semana anterior), e enviados ao canal da equipe.</p>
      {reports.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nenhum relatório ainda.</p>
      ) : (
        reports.map((r) => (
          <article key={r.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">
              {r.period === "DAILY" ? `Diário · ${fmt(r.periodStart)}` : `Semanal · ${fmt(r.periodStart)} a ${fmt(new Date(r.periodEnd.getTime() - 1))}`}
            </h2>
            <ReportBody content={r.content} />
          </article>
        ))
      )}
    </main>
  );
}
