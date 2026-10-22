import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

// Itens do menu principal, filtrados pelo papel.
const NAV: { href: string; label: string; permission: Permission; exclude?: Permission }[] = [
  { href: "/solicitante", label: "Meus chamados", permission: "ticket:create", exclude: "board:view" },
  { href: "/boards", label: "Quadro", permission: "board:view" },
  { href: "/chamados", label: "Chamados", permission: "board:view" },
];

export function navFor(role: Role) {
  return NAV.filter((item) => can(role, item.permission) && !(item.exclude && can(role, item.exclude)));
}
