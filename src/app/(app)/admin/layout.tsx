import { requireUser } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";
import { SubNav } from "@/components/shell/sub-nav";

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
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="animate-rise space-y-4">
        <p className="eyebrow">Administração</p>
        <SubNav label="Administração" items={SECTIONS.filter((s) => can(user.role, s.permission)).map(({ href, label }) => ({ href, label }))} />
      </div>
      {children}
    </div>
  );
}
