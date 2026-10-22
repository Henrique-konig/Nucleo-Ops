import { requireUser } from "@/lib/session";
import { listReports } from "@/lib/agents/summary";
import { ActionForm } from "@/components/tickets/action-form";
import { requestReportAction } from "./actions";
import { CalendarDays, CalendarRange, FileDown, FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";

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
    <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      {blocks.map((b, i) =>
        b.kind === "h" ? <h3 key={i} className="pt-2 font-semibold text-slate-900 dark:text-white">{b.text}</h3>
        : b.kind === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5 marker:text-brand-500">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        : b.text ? <p key={i} className="whitespace-pre-wrap">{b.text}</p> : null,
      )}
    </div>
  );
}

export default async function ReportsPage() {
  const user = await requireUser("metrics:view");
  const reports = await listReports(user);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Relatórios"
        description="Gerados pelo agente de resumo todo dia de manhã e às segundas (semana anterior), e enviados ao canal da equipe."
        actions={
          <>
            <ActionForm action={requestReportAction.bind(null, "DAILY")} resetOnSuccess={false} successMessage="Gerando o relatório de ontem…"><button className="btn"><CalendarDays className="size-4" aria-hidden /> Gerar diário</button></ActionForm>
            <ActionForm action={requestReportAction.bind(null, "WEEKLY")} resetOnSuccess={false} successMessage="Gerando o relatório da semana passada…"><button className="btn"><CalendarRange className="size-4" aria-hidden /> Gerar semanal</button></ActionForm>
          </>
        }
      />
      {reports.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" />} title="Nenhum relatório ainda">
          Gere um relatório diário ou semanal pelos botões acima, ou aguarde o agente de resumo.
        </EmptyState>
      ) : (
        reports.map((r) => (
          <article key={r.id} className="panel animate-rise space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className={`badge ${r.period === "DAILY" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" : "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"}`}>
                  {r.period === "DAILY" ? "Diário" : "Semanal"}
                </span>
                {r.period === "DAILY" ? fmt(r.periodStart) : `${fmt(r.periodStart)} a ${fmt(new Date(r.periodEnd.getTime() - 1))}`}
              </h2>
              <a className="btn-ghost py-1 text-xs" href={`/api/relatorios/${r.id}/pdf`}><FileDown className="size-4" aria-hidden /> Baixar PDF</a>
            </div>
            <ReportBody content={r.content} />
          </article>
        ))
      )}
    </main>
  );
}
