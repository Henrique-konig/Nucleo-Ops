// Variáveis sem as quais nenhuma página funciona. Mostradas pelo nome (nunca o valor).
const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "INTEGRATION_ENCRYPTION_KEY"] as const;

export function missingConfig(): string[] {
  return REQUIRED.filter((name) => !process.env[name]);
}

export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div role="alert" className="max-w-md space-y-2 rounded-xl border border-red-300 bg-white p-6 dark:border-red-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">Configuração incompleta</h1>
        <p className="text-sm">Defina estas variáveis de ambiente e faça um novo deploy:</p>
        <ul className="list-disc pl-5 font-mono text-sm">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        <p className="text-xs text-slate-600 dark:text-slate-400">Na Vercel: Settings → Environment Variables. O banco vem de Storage → Neon.</p>
      </div>
    </main>
  );
}
