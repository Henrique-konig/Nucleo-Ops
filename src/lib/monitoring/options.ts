/** Opções do Sentry comuns ao servidor, ao edge e ao navegador. */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Amostra de 10% das transações para desempenho; erros vão todos.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Dados pessoais (IP, cookies) ficam de fora; o usuário é identificado só pelo id.
    sendDefaultPii: false,
  };
}
