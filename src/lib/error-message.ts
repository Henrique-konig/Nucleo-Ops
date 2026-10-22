import * as Sentry from "@sentry/nextjs";
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
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return "Este item não existe mais, talvez outra pessoa o tenha excluído. Atualize a página";
  }
  console.error(err);
  const message = "Algo deu errado do nosso lado e a ação não foi concluída. Tente de novo em instantes";
  if (!Sentry.getClient()) return message;
  // Com o monitoramento ligado, o código ajuda a achar o erro no Sentry.
  const eventId = Sentry.captureException(err);
  return `${message}; se persistir, informe à equipe o código ${eventId}`;
}
