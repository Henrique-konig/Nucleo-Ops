import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";

const SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin/usuarios", label: "Usuários", permission: "user:manage" },
  { href: "/admin/agentes", label: "Agentes", permission: "agent:manage" },
  { href: "/admin/integracoes", label: "Integrações", permission: "integration:manage" },
  { href: "/admin/automacoes", label: "Automações", permission: "automation:configure" },
  { href: "/admin/equipe", label: "Equipe", permission: "team:manage" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("automation:configure");
  return (
    <div className="mx-auto max-w-6xl p-6">
      <nav aria-label="Administração" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {SECTIONS.filter((s) => can(user.role, s.permission)).map((s) => (
          <Link key={s.href} href={s.href} className="rounded-md px-3 py-1.5 text-sm hover:bg-slate-200 dark:hover:bg-slate-800">{s.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
