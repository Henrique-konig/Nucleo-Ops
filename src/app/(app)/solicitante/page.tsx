import { requireUser } from "@/lib/session";

export const metadata = { title: "Meus chamados" };

export default async function RequesterPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-semibold">Olá, {user.name}</h1>
      <p className="text-slate-600 dark:text-slate-400">
        A abertura e o acompanhamento de chamados pelo formulário e por e-mail chegam na fase 2.
      </p>
    </main>
  );
}
