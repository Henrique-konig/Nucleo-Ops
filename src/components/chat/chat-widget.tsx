"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, SendHorizontal } from "lucide-react";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };
type ChatMessage = { id: string; content: string; fromAssistant: boolean; system: boolean };

/** Chat com o assistente de primeiro nível, no portal do solicitante. */
export function ChatWidget({
  conversationId, messages, send, resolve, human,
}: {
  conversationId: string | null;
  messages: ChatMessage[];
  send: (fd: FormData) => Promise<Result>;
  resolve?: () => Promise<Result>;
  human?: () => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  // Quando a conversa vira chamado, ela sai do chat; o aviso leva até ele.
  const [handedOff, setHandedOff] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, optimistic]);

  function run(fn: () => Promise<Result>, handoffTicketId?: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else {
        setError(null);
        const data = result.data as { ticketId?: string; handoff?: boolean } | undefined;
        if (data?.handoff && data.ticketId) setHandedOff(data.ticketId);
        else if (handoffTicketId) setHandedOff(handoffTicketId);
      }
      setOptimistic(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="chat-title" className="panel flex animate-rise flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-transparent p-4 dark:border-slate-800 dark:from-brand-950/40">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-600 text-white shadow-glow">
          <Bot className="size-5" aria-hidden />
          <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
        </span>
        <div>
          <h2 id="chat-title" className="font-semibold">Assistente</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tire dúvidas sobre senha, acesso e seus chamados. Se precisar, ele passa para a equipe.</p>
        </div>
      </header>
      <ol ref={listRef} aria-live="polite" className="max-h-96 min-h-32 space-y-2.5 overflow-y-auto p-4 text-sm">
        {messages.length === 0 && !optimistic && (
          <li className="max-w-[85%] rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800">Olá! Como posso ajudar?</li>
        )}
        {messages.map((m) =>
          m.system ? (
            <li key={m.id} className="text-center text-xs text-slate-500">{m.content}</li>
          ) : (
            <li key={m.id} className={`max-w-[85%] animate-rise rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap ${m.fromAssistant ? "rounded-tl-md bg-slate-100 dark:bg-slate-800" : "ml-auto rounded-tr-md bg-brand-600 text-white"}`}>
              <span className="sr-only">{m.fromAssistant ? "Assistente: " : "Você: "}</span>
              {m.content}
            </li>
          ),
        )}
        {optimistic && <li className="ml-auto max-w-[85%] animate-rise rounded-2xl rounded-tr-md bg-brand-600/70 px-3.5 py-2.5 whitespace-pre-wrap text-white">{optimistic}</li>}
        {pending && optimistic && (
          <li className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-3 dark:bg-slate-800">
            <span className="sr-only">Assistente digitando…</span>
            {[0, 150, 300].map((d) => <span key={d} aria-hidden className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />)}
          </li>
        )}
      </ol>
      {handedOff && (
        <p role="status" className="mx-4 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-100">
          Sua conversa foi encaminhada para a equipe de TI.{" "}
          <a className="link" href={`/solicitante/chamados/${handedOff}`}>Acompanhar o chamado</a>
        </p>
      )}
      {error && <p role="alert" className="alert-error mx-4">{error}</p>}
      <form
        className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          const fd = new FormData();
          fd.set("content", text);
          setOptimistic(text);
          setDraft("");
          setHandedOff(null);
          run(() => send(fd));
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Mensagem para o assistente</label>
        <input id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} className="input" placeholder="Escreva sua dúvida" disabled={pending} />
        <button className="btn-primary" disabled={pending || !draft.trim()} aria-label="Enviar"><SendHorizontal className="size-4" aria-hidden /></button>
      </form>
      {conversationId && (resolve || human) && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {resolve && <button className="btn" disabled={pending} onClick={() => run(resolve)}>Resolveu, obrigado</button>}
          {human && <button className="btn" disabled={pending} onClick={() => run(human, conversationId)}>Falar com a equipe</button>}
        </div>
      )}
    </section>
  );
}
