"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
    <section aria-labelledby="chat-title" className="flex flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-200 p-3 dark:border-slate-800">
        <h2 id="chat-title" className="font-semibold">Assistente</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">Tire dúvidas sobre senha, acesso e seus chamados. Se precisar, ele passa para a equipe.</p>
      </header>
      <ol ref={listRef} aria-live="polite" className="max-h-80 min-h-24 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && !optimistic && <li className="text-slate-500">Como posso ajudar?</li>}
        {messages.map((m) =>
          m.system ? (
            <li key={m.id} className="text-center text-xs text-slate-500">{m.content}</li>
          ) : (
            <li key={m.id} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${m.fromAssistant ? "bg-slate-100 dark:bg-slate-800" : "ml-auto bg-sky-700 text-white"}`}>
              <span className="sr-only">{m.fromAssistant ? "Assistente: " : "Você: "}</span>
              {m.content}
            </li>
          ),
        )}
        {optimistic && <li className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-sky-700/70 px-3 py-2 text-white">{optimistic}</li>}
        {pending && optimistic && <li className="text-xs text-slate-500">Assistente digitando…</li>}
      </ol>
      {handedOff && (
        <p role="status" className="mx-3 rounded-md bg-sky-50 p-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">
          Sua conversa foi encaminhada para a equipe de TI.{" "}
          <a className="underline" href={`/solicitante/chamados/${handedOff}`}>Acompanhar o chamado</a>
        </p>
      )}
      {error && <p role="alert" className="px-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <form
        className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
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
        <button className="btn-primary" disabled={pending || !draft.trim()}>Enviar</button>
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
