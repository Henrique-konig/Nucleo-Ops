import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigError, missingConfig } from "@/components/config-check";
import { needsSetup, runSetup, setupTokenRequired } from "@/lib/setup";
import { errorMessage } from "@/lib/error-message";
import { AuthShell } from "@/components/shell/auth-shell";

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
    <AuthShell>
      <form action={setup} className="space-y-4">
        <div>
          <h1 className="page-title">Configurar o Plantão</h1>
          <p className="page-subtitle">Crie a equipe e a conta de administrador. Os demais usuários são cadastrados depois, em Administração.</p>
        </div>
        {typeof erro === "string" && (
          <p role="alert" className="alert-error">{erro}</p>
        )}
        <label className="block space-y-1.5"><span className="field-label">Nome da equipe</span><input name="teamName" required defaultValue="TI" className="input" /></label>
        <label className="block space-y-1.5"><span className="field-label">Seu nome</span><input name="name" required autoComplete="name" className="input" /></label>
        <label className="block space-y-1.5"><span className="field-label">E-mail</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
        <label className="block space-y-1.5"><span className="field-label">Senha (mín. 12 caracteres)</span><input name="password" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
        {setupTokenRequired() && (
          <label className="block space-y-1.5">
            <span className="field-label">Código de configuração</span>
            <input name="token" required autoComplete="off" className="input" />
            <span className="block text-xs text-slate-500">Valor da variável SETUP_TOKEN do servidor.</span>
          </label>
        )}
        <button className="btn-primary w-full py-2.5">Criar equipe e entrar</button>
      </form>
    </AuthShell>
  );
}
