"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

/**
 * Formulário ligado a uma server action que devolve { ok, error }. Mostra o erro,
 * limpa os campos quando dá certo e atualiza a página.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  successMessage,
  onSuccess,
}: {
  action: (fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
  onSuccess?: (data: unknown) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      ref={ref}
      className={className}
      action={(fd) =>
        startTransition(async () => {
          const result = await action(fd);
          if (result.ok) {
            if (resetOnSuccess) ref.current?.reset();
            setFeedback(successMessage ? { ok: true, text: successMessage } : null);
            onSuccess?.(result.data);
            router.refresh();
          } else {
            setFeedback({ ok: false, text: result.error });
          }
        })
      }
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {feedback && (
        <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
          {feedback.text}
        </p>
      )}
    </form>
  );
}
