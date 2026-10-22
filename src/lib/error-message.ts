import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/permissions";
import { BusinessError, NotFoundError } from "@/lib/errors";
import { Prisma } from "@/generated/prisma/client";

/** Mensagem segura para mostrar ao usuário; erros inesperados vão para o log. */
export function errorMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Dados inválidos";
  if (err instanceof ForbiddenError) return "Você não tem permissão para esta ação";
  if (err instanceof NotFoundError || err instanceof BusinessError) return err.message;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "Já existe um item com esses dados";
  console.error(err);
  return "Não foi possível concluir a ação";
}
