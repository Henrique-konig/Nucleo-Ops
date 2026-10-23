import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export type NavGroup = "Operação" | "Análise" | "Configuração";

// Itens do menu principal, filtrados pelo papel.
const NAV: { href: string; label: string; group: NavGroup; permission: Permission; exclude?: Permission }[] = [
  { href: "/solicitante", label: "Meus chamados", group: "Operação", permission: "ticket:create", exclude: "board:view" },
  { href: "/boards", label: "Quadros", group: "Operação", permission: "board:view" },
  { href: "/chamados", label: "Chamados", group: "Operação", permission: "board:view" },
  { href: "/base", label: "Base de conhecimento", group: "Operação", permission: "board:view" },
  { href: "/agentes", label: "Agentes", group: "Operação", permission: "board:view" },
  { href: "/execucoes", label: "Execuções", group: "Operação", permission: "execution:view" },
  { href: "/indicadores", label: "Indicadores", group: "Análise", permission: "metrics:view" },
  { href: "/relatorios", label: "Relatórios", group: "Análise", permission: "metrics:view" },
  { href: "/auditoria", label: "Auditoria", group: "Análise", permission: "audit:view" },
  { href: "/admin", label: "Administração", group: "Configuração", permission: "automation:configure" },
];

export function navFor(role: Role) {
  return NAV.filter((item) => can(role, item.permission) && !(item.exclude && can(role, item.exclude)));
}

// Atalhos de criação oferecidos na busca global (Ctrl+K).
const QUICK_ACTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/boards?novo=1", label: "Criar quadro", permission: "board:manage" },
  { href: "/agentes/novo", label: "Criar agente", permission: "agent:create" },
  { href: "/base/novo", label: "Novo documento", permission: "kb:edit" },
  { href: "/solicitante#novo-chamado", label: "Novo chamado", permission: "ticket:create" },
];

export function quickActionsFor(role: Role) {
  return QUICK_ACTIONS.filter((a) => can(role, a.permission)).map(({ href, label }) => ({ href, label }));
}
