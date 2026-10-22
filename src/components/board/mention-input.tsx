"use client";

import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import { mentionQuery, mentionToken } from "@/lib/mentions";
import { initials } from "@/lib/initials";
import type { MemberOption } from "./shared";

export type MentionInputHandle = { focus: () => void; clear: () => void };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  members: MemberOption[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
};

/**
 * Campo de texto com menções: ao digitar @, sugere pessoas da equipe (setas para
 * escolher, Enter ou Tab para inserir, Esc para fechar). Ctrl+Enter envia.
 * O texto guarda a menção como @[Nome](id).
 */
export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  { value, onChange, onSubmit, members, label, placeholder, disabled, rows = 3 },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputId = useId();

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    clear: () => setQuery(null),
  }));

  const normalized = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const matches = query
    ? members.filter((m) => normalized(m.name).split(/\s+/).some((part) => part.startsWith(normalized(query.query))) || normalized(m.name).startsWith(normalized(query.query))).slice(0, 6)
    : [];
  const open = matches.length > 0;

  function refresh(text: string, cursor: number) {
    setQuery(mentionQuery(text, cursor));
    setActive(0);
  }

  function insert(member: MemberOption) {
    if (!query) return;
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const token = `${mentionToken(member.name, member.id)} `;
    const next = value.slice(0, query.start) + token + value.slice(cursor);
    onChange(next);
    setQuery(null);
    const pos = query.start + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <textarea
        ref={textareaRef}
        id={inputId}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className="input resize-y"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => refresh(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(matches[active]); return; }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setQuery(null); return; }
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Pessoas para mencionar" className="absolute bottom-full left-0 z-30 mb-1 w-64 animate-pop rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lift dark:border-slate-700 dark:bg-slate-900">
          {matches.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); insert(m); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${i === active ? "bg-brand-50 text-brand-900 dark:bg-brand-950/60 dark:text-brand-100" : ""}`}
            >
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-semibold text-white">{initials(m.name)}</span>
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
