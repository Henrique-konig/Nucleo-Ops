import type { Role } from "@/generated/prisma/enums";

// Papéis e o que cada um pode fazer (seção "Usuários e papéis" do planejamento).
export const PERMISSIONS = {
  "ticket:create": ["REQUESTER", "TECHNICIAN", "COORDINATOR", "ADMIN"],
  "board:view": ["TECHNICIAN", "COORDINATOR", "ADMIN", "AUDITOR"],
  "card:create": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:edit": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:move": ["TECHNICIAN", "COORDINATOR", "ADMIN"],
  "card:assign": ["COORDINATOR", "ADMIN"],
  "card:prioritize": ["COORDINATOR", "ADMIN"],
  "column:manage": ["COORDINATOR", "ADMIN"],
  "automation:configure": ["COORDINATOR", "ADMIN"],
  "user:manage": ["ADMIN"],
  "integration:manage": ["ADMIN"],
  "agent:manage": ["ADMIN"],
  "audit:view": ["COORDINATOR", "ADMIN", "AUDITOR"],
  "metrics:view": ["COORDINATOR", "ADMIN", "AUDITOR"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_LABELS: Record<Role, string> = {
  REQUESTER: "Solicitante",
  TECHNICIAN: "Técnico",
  COORDINATOR: "Coordenador",
  ADMIN: "Administrador",
  AUDITOR: "Auditor",
};

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
