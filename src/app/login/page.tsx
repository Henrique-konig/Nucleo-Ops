import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { currentUser } from "@/lib/session";
import { ConfigError, missingConfig } from "@/components/config-check";
import { needsSetup } from "@/lib/setup";
import { AuthShell } from "@/components/shell/auth-shell";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?erro=1");
    throw err;
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const missing = missingConfig();
  if (missing.length > 0) return <ConfigError missing={missing} />;
  if (await needsSetup()) redirect("/setup");
  if (await currentUser()) redirect("/");
  const { erro, configurado } = await searchParams;

  return (
    <AuthShell>
      <form action={login} className="space-y-5">
        <div>
          <h1 className="page-title">Bem-vindo de volta</h1>
          <p className="page-subtitle">Entre com sua conta para acessar o Plantão.</p>
        </div>
        {configurado && (
          <p role="status" className="alert-success">
            Equipe criada. Entre com a conta de administrador.
          </p>
        )}
        {erro && (
          <p role="alert" className="alert-error">
            E-mail ou senha incorretos.
          </p>
        )}
        <label className="block space-y-1.5">
          <span className="field-label">E-mail</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block space-y-1.5">
          <span className="field-label">Senha</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        <button type="submit" className="btn-primary w-full py-2.5">Entrar</button>
      </form>
    </AuthShell>
  );
}
