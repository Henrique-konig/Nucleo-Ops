import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listExecutions } from "@/lib/execution/service";
import { ExecutionList } from "@/components/execution/execution-list";

export const metadata = { title: "Execuções" };

export default async function ExecutionsPage() {
  const user = await requireUser("execution:view");
  const [pending, done] = await Promise.all([listExecutions(user, "PROPOSED"), listExecutions(user, "DONE")]);
  const props = { canDecide: can(user.role, "execution:approve"), canDecideSensitive: can(user.role, "execution:approve_sensitive"), currentUserId: user.id };
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Ações aguardando confirmação</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Nenhuma ação roda sem confirmação humana. Ações sensíveis exigem coordenador ou administrador, diferente de quem propôs.
        </p>
        <ExecutionList rows={pending} {...props} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico</h2>
        <ExecutionList rows={done} {...props} />
      </section>
    </main>
  );
}
