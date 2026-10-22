import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigError, missingConfig } from "@/components/config-check";
import { needsSetup, runSetup, setupTokenRequired } from "@/lib/setup";
import { errorMessage } from "@/lib/error-message";

export const metadata: Metadata = { title: "Configuração inicial" };
export const dynamic = "force-dynamic";

async function setup(formData: FormData) {
  "use server";
  try {
    await runSetup({
      teamName: String(formData.get("teamName") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      token: String(formData.get("token") ?? "") || undefined,
    });
  } catch (err) {
    redirect(`/setup?erro=${encodeURIComponent(errorMessage(err))}`);
  }
  redirect("/login?configurado=1");
}

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const missing = missingConfig();
  if (missing.length > 0) return <ConfigError missing={missing} />;
  if (!(await needsSetup())) redirect("/login");
  const { erro } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={setup} className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-2xl font-semibold">Configurar o Plantão</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Crie a equipe e a conta de administrador. Os demais usuários são cadastrados depois, em Administração.</p>
        </div>
        {typeof erro === "string" && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{erro}</p>
        )}
        <label className="block space-y-1"><span className="text-sm font-medium">Nome da equipe</span><input name="teamName" required defaultValue="TI" className="input" /></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Seu nome</span><input name="name" required autoComplete="name" className="input" /></label>
        <label className="block space-y-1"><span className="text-sm font-medium">E-mail</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Senha (mín. 12 caracteres)</span><input name="password" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
        {setupTokenRequired() && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Código de configuração</span>
            <input name="token" required autoComplete="off" className="input" />
            <span className="block text-xs text-slate-500">Valor da variável SETUP_TOKEN do servidor.</span>
          </label>
        )}
        <button className="btn-primary w-full">Criar equipe e entrar</button>
      </form>
    </main>
  );
}
