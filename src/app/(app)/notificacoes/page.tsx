import { requireUser } from "@/lib/session";
import { listNotifications } from "@/lib/inbox";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationsPage } from "@/components/shell/notifications-page";

export const metadata = { title: "Notificações" };

export default async function Page() {
  const user = await requireUser();
  const data = await listNotifications(user, 100);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader title="Notificações" description="Menções, atribuições, comentários nos seus cartões e respostas dos solicitantes." />
      <NotificationsPage initial={data} />
    </main>
  );
}
