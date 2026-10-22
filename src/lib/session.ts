import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { assertCan, type Permission } from "@/lib/permissions";

/**
 * Usuário autenticado, relido do banco a cada chamada para que desativações
 * e mudanças de papel valham imediatamente, sem esperar o token expirar.
 */
export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, teamId: true, active: true },
  });
  return user?.active ? user : null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** Para páginas: redireciona ao login sem sessão; lança erro sem permissão. */
export async function requireUser(permission?: Permission): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (permission) assertCan(user.role, permission);
  return user;
}
