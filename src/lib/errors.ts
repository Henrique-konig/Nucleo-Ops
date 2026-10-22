import type { Role } from "@/generated/prisma/enums";

/** Usuário que executa uma operação (sempre relido do banco pela sessão). */
export type Actor = { id: string; role: Role; teamId: string };

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado`);
    this.name = "NotFoundError";
  }
}

/** Regra de negócio violada; a mensagem é mostrada ao usuário. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessError";
  }
}
