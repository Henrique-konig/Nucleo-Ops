"use client";

import { useState } from "react";
import { ActionForm } from "@/components/tickets/action-form";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };
type CatalogItem = { key: string; label: string; description: string; params: Record<string, string>; sensitive: boolean };

/** Proposta manual de ação pré-aprovada; outra confirmação humana é exigida para executar. */
export function ProposeExecutionForm({ catalog, action }: { catalog: CatalogItem[]; action: (fd: FormData) => Promise<Result> }) {
  const [key, setKey] = useState(catalog[0]?.key ?? "");
  const item = catalog.find((c) => c.key === key);
  return (
    <ActionForm action={action} successMessage="Ação proposta. Ela aguarda confirmação em Execuções." className="space-y-2">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Ação</span>
        <select name="actionKey" value={key} onChange={(e) => setKey(e.target.value)} className="input">
          {catalog.map((c) => <option key={c.key} value={c.key}>{c.label}{c.sensitive ? " (sensível)" : ""}</option>)}
        </select>
      </label>
      {item && <p className="text-xs text-slate-600 dark:text-slate-400">{item.description}</p>}
      {item && Object.entries(item.params).map(([name, help]) => (
        <label key={`${key}-${name}`} className="block space-y-1">
          <span className="text-sm">{name} <span className="text-xs text-slate-500">({help})</span></span>
          <input name={`param.${name}`} required className="input py-1" />
        </label>
      ))}
      <label className="block space-y-1">
        <span className="text-sm">Motivo</span>
        <input name="reason" maxLength={500} className="input py-1" />
      </label>
      <button className="btn">Propor ação</button>
    </ActionForm>
  );
}
