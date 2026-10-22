import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { navFor } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar items={navFor(user.role)} user={{ name: user.name, role: ROLE_LABELS[user.role] }} signOut={logout} />
      <div className="min-w-0 flex-1 animate-fade-in">{children}</div>
    </div>
  );
}
