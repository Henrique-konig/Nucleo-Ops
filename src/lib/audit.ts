import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  teamId: string;
  type: string;
  targetType: "card" | "column" | "board" | "ticket" | "checklist_item" | "label" | "user" | "agent" | "integration";
  targetId: string;
  payload?: Prisma.InputJsonValue;
  result?: Prisma.InputJsonValue;
  confirmedById?: string;
} & ({ userId: string; agentId?: never } | { agentId: string; userId?: never });

/**
 * Registra uma ação no log de auditoria (RF-08). Deve rodar na mesma transação
 * da mudança, para que não exista alteração sem registro nem registro sem alteração.
 */
export function recordAction(tx: Tx, entry: AuditEntry) {
  return tx.action.create({ data: entry });
}
