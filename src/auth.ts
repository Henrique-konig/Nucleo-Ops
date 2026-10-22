import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

const credentialsSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new CredentialsSignin();
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.active || !user.passwordHash) throw new CredentialsSignin();
        if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) throw new CredentialsSignin();
        return { id: user.id, name: user.name, email: user.email, role: user.role, teamId: user.teamId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.teamId = user.teamId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role as Role;
      session.user.teamId = token.teamId;
      return session;
    },
  },
});
