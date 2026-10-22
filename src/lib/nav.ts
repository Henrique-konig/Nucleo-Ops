import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

// Itens do menu principal, filtrados pelo papel.
const NAV: { href: string; label: string; permission: Permission; exclude?: Permission }[] = [
  { href: "/solicitante", label: "Meus chamados", permission: "ticket:create", exclude: "board:view" },
  { href: "/boards", label: "Quadro", permission: "board:view" },
  { href: "/chamados", label: "Chamados", permission: "board:view" },
  { href: "/base", label: "Base de conhecimento", permission: "board:view" },
  { href: "/execucoes", label: "Execuções", permission: "execution:view" },
  { href: "/auditoria", label: "Auditoria", permission: "audit:view" },
  { href: "/admin", label: "Administração", permission: "automation:configure" },
];

export function navFor(role: Role) {
  return NAV.filter((item) => can(role, item.permission) && !(item.exclude && can(role, item.exclude)));
}
