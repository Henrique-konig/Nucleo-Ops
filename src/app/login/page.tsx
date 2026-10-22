import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { currentUser } from "@/lib/session";
import { needsSetup } from "@/lib/setup";

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
  if (await needsSetup()) redirect("/setup");
  if (await currentUser()) redirect("/");
  const { erro, configurado } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-2xl font-semibold">Plantão</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Central de operações para TI</p>
        </div>
        {configurado && (
          <p role="status" className="rounded-md bg-green-50 p-2 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
            Equipe criada. Entre com a conta de administrador.
          </p>
        )}
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            E-mail ou senha incorretos.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium">E-mail</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Senha</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        <button type="submit" className="btn-primary w-full">Entrar</button>
      </form>
    </main>
  );
}
