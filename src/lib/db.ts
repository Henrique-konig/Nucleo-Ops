import "server-only";
import { createPrismaClient } from "@/lib/prisma-client";

type Client = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Client };

function client(): Client {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

// Criado no primeiro uso, e não ao importar: o build (que importa as rotas para
// coletar a configuração) funciona mesmo sem DATABASE_URL.
export const db = new Proxy({} as Client, {
  get(_target, prop) {
    const value = Reflect.get(client(), prop);
    return typeof value === "function" ? value.bind(client()) : value;
  },
});
