import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { apiBaseUrl } from "./lib/api";
import { signInternalCall } from "./lib/internal-auth";

/**
 * NextAuth v5 dengan strategi JWT (tanpa adapter database).
 *
 * Kenapa tanpa adapter: `@auth/prisma-adapter` bergantung pada `@prisma/client`,
 * sedangkan repo ini memakai Prisma 8 contract mode (`@prisma/orm-postgres`).
 * Jadi verifikasi kredensial dilakukan lewat API Express (pemegang database),
 * dan sesi disimpan sebagai JWT di cookie.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) return null;

        const res = await fetch(`${apiBaseUrl()}/api/auth/verify-credentials`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": signInternalCall("service"),
          },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) return null;

        const user = (await res.json()) as {
          id: string;
          email: string;
          name?: string | null;
        };

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
