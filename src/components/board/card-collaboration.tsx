"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Download, FileText, History, Image as ImageIcon, MessageSquare, Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import type { CardDetails } from "@/lib/collaboration";
import * as actions from "@/app/(app)/boards/[boardId]/actions";
import { ActivityFeed, relativeTime } from "@/components/activity/activity-feed";
import { initials } from "@/lib/initials";
import { MentionInput, type MentionInputHandle } from "./mention-input";
import { RichText } from "./rich-text";
import type { MemberOption } from "./shared";

const MAX_BYTES = 4 * 1024 * 1024;

type Props = {
  cardId: string;
  currentUserId: string;
  members: MemberOption[];
  canComment: boolean;
  canEdit: boolean;
  canModerate: boolean;
  /** Muda a cada aviso de tempo real do quadro, para recarregar os detalhes. */
  version: number;
  onResult: (r: actions.ActionResult<unknown>) => boolean;
};

type Tab = "comments" | "attachments" | "activity";

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function CardCollaboration({ cardId, currentUserId, members, canComment, canEdit, canModerate, version, onResult }: Props) {
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("comments");

  const load = useCallback(async () => {
    const result = await actions.getCardDetailsAction(cardId);
    if (result.ok) {
      setDetails(result.data);
      setLoadError(null);
    } else setLoadError(result.error);
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load, version]);

  const tabs: { key: Tab; label: string; Icon: typeof MessageSquare; count?: number }[] = [
    { key: "comments", label: "Comentários", Icon: MessageSquare, count: details?.comments.length },
    { key: "attachments", label: "Anexos", Icon: Paperclip, count: details?.attachments.length },
    { key: "activity", label: "Atividade", Icon: History },
  ];

  return (
    <section aria-label="Colaboração" className="space-y-4">
      <div role="tablist" aria-label="Colaboração no cartão" className="flex gap-1 border-b border-slate-100 dark:border-slate-800">
        {tabs.map(({ key, label, Icon, count }) => (
          <button
            key={key}
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((t) => t.key === tab);
              if (e.key === "ArrowRight") setTab(tabs[(i + 1) % tabs.length].key);
              if (e.key === "ArrowLeft") setTab(tabs[(i - 1 + tabs.length) % tabs.length].key);
            }}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === key ? "border-brand-500 text-slate-900 dark:text-white" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {count != null && count > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums dark:bg-slate-800">{count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {loadError && <p role="alert" className="alert-error">{loadError}</p>}
        {!details && !loadError && (
          <div className="space-y-2" aria-busy="true" aria-label="Carregando">
            {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />)}
          </div>
        )}
        {details && tab === "comments" && (
          <Comments details={details} cardId={cardId} currentUserId={currentUserId} members={members} canComment={canComment} canModerate={canModerate} onResult={onResult} reload={load} />
        )}
        {details && tab === "attachments" && <Attachments details={details} cardId={cardId} canEdit={canEdit} onResult={onResult} reload={load} />}
        {details && tab === "activity" && <ActivityFeed items={details.activity} />}
      </div>
    </section>
  );
}

function Comments({
  details, cardId, currentUserId, members, canComment, canModerate, onResult, reload,
}: {
  details: CardDetails; cardId: string; currentUserId: string; members: MemberOption[]; canComment: boolean; canModerate: boolean;
  onResult: Props["onResult"]; reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<MentionInputHandle>(null);
  const endRef = useRef<HTMLLIElement>(null);

  function submit() {
    if (!draft.trim()) return;
    startTransition(async () => {
      if (onResult(await actions.addCommentAction({ cardId, content: draft }))) {
        setDraft("");
        inputRef.current?.clear();
        await reload();
        endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {details.comments.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum comentário ainda.{canComment && " Use @ para chamar alguém da equipe."}</p>
      ) : (
        <ol className="space-y-3">
          {details.comments.map((c) => {
            const mine = c.author.id === currentUserId;
            return (
              <li key={c.id} className="flex gap-3">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white">
                  {initials(c.author.name)}
                </span>
                <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                  <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-sm font-medium">
                      {c.author.name}
                      <time dateTime={new Date(c.createdAt).toISOString()} title={new Date(c.createdAt).toLocaleString("pt-BR")} className="ml-2 text-xs font-normal text-slate-400">
                        {relativeTime(c.createdAt)}{c.editedAt && " · editado"}
                      </time>
                    </p>
                    {canComment && (mine || canModerate) && editing?.id !== c.id && (
                      <span className="flex gap-1">
                        {mine && (
                          <button className="icon-btn size-6" aria-label="Editar comentário" onClick={() => setEditing({ id: c.id, text: c.content })}>
                            <Pencil className="size-3.5" aria-hidden />
                          </button>
                        )}
                        <button
                          className="icon-btn size-6 hover:text-red-600"
                          aria-label="Remover comentário"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm("Remover este comentário?")) return;
                            startTransition(async () => {
                              if (onResult(await actions.deleteCommentAction({ commentId: c.id }))) await reload();
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    )}
                  </div>
                  {editing?.id === c.id ? (
                    <div className="space-y-2">
                      <MentionInput
                        label="Editar comentário"
                        value={editing.text}
                        onChange={(text) => setEditing({ id: c.id, text })}
                        members={members}
                        disabled={pending}
                        onSubmit={() => startTransition(async () => {
                          if (onResult(await actions.editCommentAction({ commentId: c.id, content: editing.text }))) { setEditing(null); await reload(); }
                        })}
                      />
                      <div className="flex gap-2">
                        <button
                          className="btn-primary py-1.5"
                          disabled={pending || !editing.text.trim()}
                          onClick={() => startTransition(async () => {
                            if (onResult(await actions.editCommentAction({ commentId: c.id, content: editing.text }))) { setEditing(null); await reload(); }
                          })}
                        >
                          Salvar
                        </button>
                        <button className="btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <RichText content={c.content} currentUserId={currentUserId} />
                  )}
                </div>
              </li>
            );
          })}
          <li ref={endRef} aria-hidden />
        </ol>
      )}

      {canComment && (
        <div className="space-y-2">
          <MentionInput
            ref={inputRef}
            label="Novo comentário"
            placeholder="Escreva um comentário… use @ para mencionar"
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            members={members}
            disabled={pending}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">Ctrl + Enter para enviar</p>
            <button className="btn-primary py-1.5" disabled={pending || !draft.trim()} onClick={submit}>Comentar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Attachments({
  details, cardId, canEdit, onResult, reload,
}: { details: CardDetails; cardId: string; canEdit: boolean; onResult: Props["onResult"]; reload: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = [...files];
    const tooBig = list.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" passa de 4 MB.`);
      return;
    }
    startTransition(async () => {
      for (const file of list) {
        const fd = new FormData();
        fd.set("cardId", cardId);
        fd.set("file", file);
        if (!onResult(await actions.uploadAttachmentAction(fd))) break;
      }
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    });
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            upload(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition ${
            dragOver ? "border-brand-400 bg-brand-50/60 dark:bg-brand-950/30" : "border-slate-200 dark:border-slate-700"
          }`}
        >
          <Upload className="size-5 text-slate-400" aria-hidden />
          <p className="text-slate-600 dark:text-slate-300">
            Arraste arquivos para cá ou{" "}
            <label className="link cursor-pointer">
              escolha no computador
              <input ref={fileRef} type="file" multiple className="sr-only" disabled={pending} onChange={(e) => upload(e.target.files)} />
            </label>
          </p>
          <p className="text-xs text-slate-400">Até 4 MB por arquivo</p>
          {pending && <p aria-live="polite" className="text-xs text-brand-700 dark:text-brand-300">Enviando…</p>}
        </div>
      )}
      {error && <p role="alert" className="alert-error">{error}</p>}

      {details.attachments.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum anexo.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {details.attachments.map((a) => {
            const Icon = a.contentType.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="link block truncate">{a.filename}</a>
                  <p className="text-xs text-slate-500">{formatBytes(a.size)} · {a.uploader.name} · {relativeTime(a.createdAt)}</p>
                </div>
                <a href={`/api/attachments/${a.id}`} download={a.filename} className="icon-btn size-7" aria-label={`Baixar ${a.filename}`}>
                  <Download className="size-4" aria-hidden />
                </a>
                {canEdit && (
                  <button
                    className="icon-btn size-7 hover:text-red-600"
                    aria-label={`Remover ${a.filename}`}
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Remover o anexo "${a.filename}"?`)) return;
                      startTransition(async () => {
                        if (onResult(await actions.deleteAttachmentAction({ attachmentId: a.id }))) await reload();
                      });
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
