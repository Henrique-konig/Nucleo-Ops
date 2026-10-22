import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export type NavGroup = "Operação" | "Análise" | "Configuração";

// Itens do menu principal, filtrados pelo papel.
const NAV: { href: string; label: string; group: NavGroup; permission: Permission; exclude?: Permission }[] = [
  { href: "/solicitante", label: "Meus chamados", group: "Operação", permission: "ticket:create", exclude: "board:view" },
  { href: "/boards", label: "Quadro", group: "Operação", permission: "board:view" },
  { href: "/chamados", label: "Chamados", group: "Operação", permission: "board:view" },
  { href: "/base", label: "Base de conhecimento", group: "Operação", permission: "board:view" },
  { href: "/execucoes", label: "Execuções", group: "Operação", permission: "execution:view" },
  { href: "/indicadores", label: "Indicadores", group: "Análise", permission: "metrics:view" },
  { href: "/relatorios", label: "Relatórios", group: "Análise", permission: "metrics:view" },
  { href: "/auditoria", label: "Auditoria", group: "Análise", permission: "audit:view" },
  { href: "/admin", label: "Administração", group: "Configuração", permission: "automation:configure" },
];

export function navFor(role: Role) {
  return NAV.filter((item) => can(role, item.permission) && !(item.exclude && can(role, item.exclude)));
}
