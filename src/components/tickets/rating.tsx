"use client";

import { ActionForm } from "./action-form";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export function RatingForm({ current, action }: { current: number | null; action: (fd: FormData) => Promise<Result> }) {
  return (
    <ActionForm action={action} resetOnSuccess={false} successMessage="Obrigado pela avaliação!" className="space-y-2">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Como foi o atendimento?</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm has-[:checked]:border-sky-600 has-[:checked]:bg-sky-50 dark:border-slate-700 dark:has-[:checked]:bg-sky-950">
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
