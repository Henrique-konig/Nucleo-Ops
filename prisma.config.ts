import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrações precisam de conexão direta (sem pooler): DIRECT_URL, ou DATABASE_URL_UNPOOLED
// quando o banco vem da integração Neon da Vercel.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
