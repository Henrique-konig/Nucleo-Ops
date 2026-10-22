"use client";

import { useState } from "react";
import { Bot, Wand2 } from "lucide-react";
import { ActionForm } from "@/components/tickets/action-form";
import { ACCENTS, accent } from "@/components/ui/accent";

type Values = {
  name: string;
  role: string;
  instructions: string;
  color: string;
  runOnAssign: boolean;
  useKnowledge: boolean;
  active: boolean;
};

type Template = { name: string; role: string; instructions: string; color: string };

const EMPTY: Values = { name: "", role: "", instructions: "", color: "violet", runOnAssign: true, useKnowledge: true, active: true };

const AGENT_COLORS = ["violet", "sky", "emerald", "amber", "rose", "slate"];

/** Formulário de criação e edição de agente, com modelos prontos para começar. */
export function AgentForm({ action, initial, templates = [], submitLabel }: {
  action: (fd: FormData) => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>;
  initial?: Values;
  templates?: Template[];
  submitLabel: string;
}) {
  const [values, setValues] = useState<Values>(initial ?? EMPTY);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  const style = accent(values.color);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-5">
        {templates.length > 0 && (
          <section aria-labelledby="templates-title" className="space-y-2">
            <h2 id="templates-title" className="field-label flex items-center gap-1.5"><Wand2 className="size-3.5" aria-hidden /> Comece por um modelo</h2>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`badge cursor-pointer px-2.5 py-1 text-sm ring-1 transition hover:brightness-95 ${accent(t.color).soft}`}
                  onClick={() => setValues({ ...EMPTY, ...t })}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        )}

        <ActionForm action={action} resetOnSuccess={false} successMessage={initial ? "Agente salvo." : undefined} className="space-y-4">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="field-label">Nome</span>
                <input name="name" required minLength={2} maxLength={60} value={values.name} onChange={(e) => set({ name: e.target.value })} className="input" placeholder="Ex.: Analista de rede" />
              </label>
              <label className="block space-y-1">
                <span className="field-label">Função</span>
                <input name="role" required minLength={2} maxLength={160} value={values.role} onChange={(e) => set({ role: e.target.value })} className="input" placeholder="O que ele faz, em uma frase" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="field-label">Instruções</span>
              <textarea
                name="instructions"
                required
                minLength={10}
                maxLength={8000}
                rows={8}
                value={values.instructions}
                onChange={(e) => set({ instructions: e.target.value })}
                className="input font-mono text-[13px] leading-relaxed"
                placeholder="Explique como o agente deve trabalhar: o que analisar, o formato da resposta, o que evitar."
              />
              <span className="block text-xs text-slate-500 dark:text-slate-400">{values.instructions.length}/8000 · O agente recebe o cartão, o chamado com a conversa e, se ativado, trechos da base de conhecimento.</span>
            </label>
            <fieldset className="space-y-1.5">
              <legend className="field-label mb-1.5">Cor</legend>
              <div className="flex flex-wrap gap-2">
                {AGENT_COLORS.map((value) => (
                  <label key={value} title={ACCENTS[value].name} className={`grid size-8 cursor-pointer place-items-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900 ${values.color === value ? "ring-brand-500" : "ring-transparent hover:ring-slate-300"}`}>
                    <input type="radio" name="color" value={value} checked={values.color === value} onChange={() => set({ color: value })} className="sr-only" />
                    <span aria-hidden className={`size-6 rounded-full ${ACCENTS[value].dot}`} />
                    <span className="sr-only">{ACCENTS[value].name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2 text-sm">
              <legend className="field-label mb-1.5">Comportamento</legend>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="runOnAssign" checked={values.runOnAssign} onChange={(e) => set({ runOnAssign: e.target.checked })} className="mt-0.5" />
                <span>Trabalhar assim que for atribuído a um cartão <span className="block text-xs text-slate-500 dark:text-slate-400">Sem isso, só roda quando alguém clicar em “Pedir ao agente”.</span></span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="useKnowledge" checked={values.useKnowledge} onChange={(e) => set({ useKnowledge: e.target.checked })} className="mt-0.5" />
                <span>Consultar a base de conhecimento</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="active" checked={values.active} onChange={(e) => set({ active: e.target.checked })} className="mt-0.5" />
                <span>Ativo <span className="block text-xs text-slate-500 dark:text-slate-400">Desligado, não aparece nos cartões e não aceita pedidos.</span></span>
              </label>
            </fieldset>
            <button className="btn-primary">{submitLabel}</button>
          </div>
        </ActionForm>
      </div>

      <aside aria-label="Prévia" className="h-fit space-y-3 lg:sticky lg:top-8">
        <p className="eyebrow">Prévia no cartão</p>
        <div className="panel space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className={`grid size-10 place-items-center rounded-xl ring-1 ${style.soft}`}><Bot className="size-5" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{values.name || "Nome do agente"}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{values.role || "Função"}</span>
            </span>
          </div>
          <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <li>{values.runOnAssign ? "• Começa ao ser atribuído" : "• Roda sob demanda"}</li>
            <li>{values.useKnowledge ? "• Usa a base de conhecimento" : "• Não consulta a base"}</li>
            <li>• Não altera nada sozinho: escreve no cartão</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Botão de envio que pede confirmação antes. */
export function ConfirmSubmit({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
