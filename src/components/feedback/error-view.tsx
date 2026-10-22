"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = {
  error: Error & { digest?: string };
  reset?: () => void;
  /** Dentro do app há barra lateral; fora dele a tela ocupa a página toda. */
  fullPage?: boolean;
};

/** Tela de erro amigável: explica o que houve, oferece tentar de novo e envia o erro ao monitoramento. */
export function ErrorView({ error, reset, fullPage = false }: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <main className={`grid place-items-center px-4 py-16 ${fullPage ? "min-h-dvh" : "min-h-[70dvh]"}`}>
      <div role="alert" className="panel w-full max-w-md animate-rise space-y-4 p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900/60">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">{offline ? "Você está sem conexão" : "Não foi possível carregar esta página"}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {offline
              ? "Verifique a internet e tente de novo. Nada do que você já salvou foi perdido."
              : "Algo deu errado do nosso lado. A equipe já foi avisada automaticamente. Tente de novo em instantes."}
          </p>
        </div>
        {error.digest && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Código do erro: <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{error.digest}</code>
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {reset && (
            <button className="btn-primary" onClick={reset}>
              <RotateCcw className="size-4" aria-hidden /> Tentar de novo
            </button>
          )}
          <Link href="/" className="btn">Ir para o início</Link>
        </div>
      </div>
    </main>
  );
}
