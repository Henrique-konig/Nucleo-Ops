"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Último recurso: o layout raiz falhou, então a página não tem estilos nem fontes.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <main role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>O Plantão encontrou um erro inesperado</h1>
          <p style={{ color: "#4e5363" }}>A equipe já foi avisada. Tente recarregar a página.</p>
          {error.digest && <p style={{ color: "#4e5363", fontSize: 12 }}>Código do erro: {error.digest}</p>}
          <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: 0, background: "#5f50e4", color: "white", cursor: "pointer" }}>
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
