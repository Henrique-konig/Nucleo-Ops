// Variáveis sem as quais nenhuma página funciona. Mostradas pelo nome (nunca o valor).
const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "INTEGRATION_ENCRYPTION_KEY"] as const;

export function missingConfig(): string[] {
  return REQUIRED.filter((name) => !process.env[name]);
}

export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div role="alert" className="max-w-md animate-rise space-y-3 rounded-2xl border border-red-200 bg-white p-7 shadow-lift dark:border-red-900/60 dark:bg-slate-900">
        <h1 className="page-title">Configuração incompleta</h1>
        <p className="text-sm">Defina estas variáveis de ambiente e faça um novo deploy:</p>
        <ul className="space-y-1 font-mono text-sm">{missing.map((m) => <li key={m} className="rounded-md bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950/50 dark:text-red-300">{m}</li>)}</ul>
        <p className="text-xs text-slate-600 dark:text-slate-400">Na Vercel: Settings → Environment Variables. O banco vem de Storage → Neon.</p>
      </div>
    </main>
  );
}
