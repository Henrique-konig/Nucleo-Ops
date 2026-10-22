import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { navFor, quickActionsFor } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { CommandPalette } from "@/components/shell/command-palette";

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
      <CommandPalette pages={[...navFor(user.role).map(({ href, label }) => ({ href, label })), { href: "/conta", label: "Minha conta" }]} actions={quickActionsFor(user.role)} />
    </div>
  );
}
