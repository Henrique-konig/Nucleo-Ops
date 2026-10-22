"use client";

import { ActionForm } from "./action-form";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export function RatingForm({ current, action }: { current: number | null; action: (fd: FormData) => Promise<Result> }) {
  return (
    <ActionForm action={action} resetOnSuccess={false} successMessage="Obrigado pela avaliação!" className="panel space-y-3 p-4">
      <fieldset className="space-y-2">
        <legend className="field-label">Como foi o atendimento?</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium transition hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 has-[:checked]:ring-4 has-[:checked]:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-900 dark:has-[:checked]:bg-brand-950/60 dark:has-[:checked]:text-brand-200">
              <input type="radio" name="score" value={n} defaultChecked={current === n} required className="sr-only" />
              {n} {n === 1 ? "· ruim" : n === 5 ? "· ótimo" : ""}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn">Enviar avaliação</button>
    </ActionForm>
  );
}
