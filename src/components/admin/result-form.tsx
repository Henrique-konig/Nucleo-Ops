"use client";

import { useState } from "react";
import { ActionForm } from "@/components/tickets/action-form";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

const LABELS: Record<string, string> = { password: "Senha temporária", inboundUrl: "URL para configurar no serviço" };

function flatten(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "id") continue;
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>));
    else if (v != null && v !== "") out[LABELS[k] ?? k] = String(v);
  }
  return out;
}

/**
 * Formulário cujo resultado traz segredos (senha temporária, tokens gerados),
 * mostrados uma única vez para quem fez a ação.
 */
export function ResultForm({
  action, children, className, title,
}: { action: (fd: FormData) => Promise<Result>; children: React.ReactNode; className?: string; title: string }) {
  const [shown, setShown] = useState<Record<string, string> | null>(null);
  return (
    <div className="space-y-2">
      <ActionForm
        action={action}
        className={className}
        onSuccess={(data) => {
          const values = data && typeof data === "object" ? flatten(data as Record<string, unknown>) : {};
          setShown(Object.keys(values).length > 0 ? values : null);
        }}
      >
        {children}
      </ActionForm>
      {shown && (
        <div role="status" className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">{title} — copie agora, não será mostrado de novo.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {Object.entries(shown).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-600 dark:text-slate-400">{k}</dt>
                <dd className="break-all font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <button className="text-xs underline" onClick={() => setShown(null)}>Ocultar</button>
        </div>
      )}
    </div>
  );
}
