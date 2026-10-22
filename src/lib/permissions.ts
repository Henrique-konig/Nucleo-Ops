import type { Role } from "@/generated/prisma/enums";

// Papéis e o que cada um pode fazer (seção "Usuários e papéis" do planejamento).
export const PERMISSIONS = {
  "ticket:create": ["REQUESTER", "TECHNICIAN", "COORDINATOR", "ADMIN"],
  "board:view": ["TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"],
  "card:create": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:edit": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:move": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:comment": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:assign": ["COORDINATOR", "ADMIN"],
  "card:prioritize": ["COORDINATOR", "ADMIN"],
  "kb:edit": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "ai:use": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "execution:propose": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  // Ações sensíveis (que afetam produção) exigem também "execution:approve_sensitive".
  "execution:approve": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "execution:approve_sensitive": ["COORDINATOR", "ADMIN"],
  "execution:view": ["TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"],
  "team:manage": ["ADMIN"],
  "column:manage": ["COORDINATOR", "ADMIN"],
  // Criar, renomear e excluir quadros.
  "board:manage": ["COORDINATOR", "ADMIN"],
  // Agentes personalizados (nome, função, instruções). Os agentes de sistema ficam em "agent:manage".
  "agent:create": ["COORDINATOR", "ADMIN"],
  "automation:configure": ["COORDINATOR", "ADMIN"],
  "user:manage": ["ADMIN"],
  "integration:manage": ["ADMIN"],
  "agent:manage": ["ADMIN"],
  "audit:view": ["COORDINATOR", "ADMIN", "AUDITOR"],
  "metrics:view": ["COORDINATOR", "ADMIN", "AUDITOR"],
  // Exportar a lista de chamados em massa (CSV/PDF) tira dados da plataforma.
  "ticket:export": ["COORDINATOR", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_LABELS: Record<Role, string> = {
  REQUESTER: "Solicitante",
  TECHNICIAN: "Técnico",
  COORDINATOR: "Coordenador",
  ADMIN: "Administrador",
  AUDITOR: "Auditor",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  REQUESTER: "Abre chamados e acompanha os próprios pelo portal.",
  TECHNICIAN: "Atende chamados no quadro, responde e propõe execuções.",
  COORDINATOR: "Distribui e prioriza o trabalho, configura colunas e automações, vê indicadores e auditoria.",
  ADMIN: "Tudo do coordenador, mais usuários, agentes, integrações e dados da equipe.",
  AUDITOR: "Somente leitura: quadro, execuções, indicadores e auditoria.",
};

export type PermissionGroup = "Chamados e quadro" | "Conhecimento e IA" | "Execuções" | "Gestão" | "Análise" | "Outras";

// Texto mostrado na matriz de perfis de acesso (Administração > Perfis).
// Permissão sem texto aqui aparece pelo nome técnico, no grupo "Outras".
const PERMISSION_LABELS: Partial<Record<Permission, { label: string; group: PermissionGroup }>> = {
  "ticket:create": { label: "Abrir chamados", group: "Chamados e quadro" },
  "board:view": { label: "Ver quadro, chamados e base de conhecimento", group: "Chamados e quadro" },
  "card:create": { label: "Criar cartões", group: "Chamados e quadro" },
  "card:edit": { label: "Editar cartões e responder chamados", group: "Chamados e quadro" },
  "card:move": { label: "Mover cartões e mudar status", group: "Chamados e quadro" },
  "card:comment": { label: "Comentar e mencionar pessoas nos cartões", group: "Chamados e quadro" },
  "card:assign": { label: "Atribuir responsável", group: "Chamados e quadro" },
  "card:prioritize": { label: "Mudar prioridade", group: "Chamados e quadro" },
  "column:manage": { label: "Gerenciar colunas", group: "Chamados e quadro" },
  "board:manage": { label: "Criar, editar e excluir quadros", group: "Chamados e quadro" },
  "ticket:export": { label: "Exportar chamados (CSV/PDF)", group: "Chamados e quadro" },
  "kb:edit": { label: "Editar a base de conhecimento", group: "Conhecimento e IA" },
  "ai:use": { label: "Usar a IA nos chamados", group: "Conhecimento e IA" },
  "agent:create": { label: "Criar e editar agentes da equipe", group: "Conhecimento e IA" },
  "execution:propose": { label: "Propor execuções", group: "Execuções" },
  "execution:approve": { label: "Aprovar execuções", group: "Execuções" },
  "execution:approve_sensitive": { label: "Aprovar execuções sensíveis (produção)", group: "Execuções" },
  "execution:view": { label: "Ver execuções", group: "Execuções" },
  "automation:configure": { label: "Configurar automações", group: "Gestão" },
  "user:manage": { label: "Gerenciar usuários e papéis", group: "Gestão" },
  "integration:manage": { label: "Gerenciar integrações", group: "Gestão" },
  "agent:manage": { label: "Gerenciar agentes", group: "Gestão" },
  "team:manage": { label: "Gerenciar dados da equipe", group: "Gestão" },
  "metrics:view": { label: "Ver indicadores e relatórios", group: "Análise" },
  "audit:view": { label: "Ver e exportar a auditoria", group: "Análise" },
};

export function describePermission(permission: Permission): { label: string; group: PermissionGroup } {
  return PERMISSION_LABELS[permission] ?? { label: permission, group: "Outras" };
}

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Sem permissão: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
