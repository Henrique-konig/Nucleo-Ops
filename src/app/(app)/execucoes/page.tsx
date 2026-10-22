import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listExecutions } from "@/lib/execution/service";
import { ExecutionList } from "@/components/execution/execution-list";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Execuções" };

export default async function ExecutionsPage() {
  const user = await requireUser("execution:view");
  const [pending, done] = await Promise.all([listExecutions(user, "PROPOSED"), listExecutions(user, "DONE")]);
  const props = { canDecide: can(user.role, "execution:approve"), canDecideSensitive: can(user.role, "execution:approve_sensitive"), currentUserId: user.id };
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <section className="space-y-5">
        <PageHeader
          title="Ações aguardando confirmação"
          description="Nenhuma ação roda sem confirmação humana. Ações sensíveis exigem coordenador ou administrador, diferente de quem propôs."
        />
        <ExecutionList rows={pending} {...props} />
      </section>
      <section className="space-y-3 pt-4">
        <h2 className="section-title">Histórico</h2>
        <ExecutionList rows={done} {...props} />
      </section>
    </main>
  );
}
