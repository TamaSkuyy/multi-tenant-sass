import type { Request, Response } from "express";

import { hashPassword, verifyPassword } from "../lib/password";
import { db } from "../prisma/db";
import { credentialsSchema, registerSchema } from "../schemas/auth.schema";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function details(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Data pendaftaran tidak valid",
      details: details(parsed.error.issues),
    });
  }

  const email = normalizeEmail(parsed.data.email);
  const existing = await db.orm.public.User.where({ email }).first();

  if (existing) {
    return res.status(409).json({ error: "Email sudah terdaftar" });
  }

  const user = await db.orm.public.User.create({
    email,
    name: parsed.data.name ?? email.split("@")[0],
    passwordHash: hashPassword(parsed.data.password),
  });

  return res.status(201).json({ id: user.id, email: user.email });
}

/**
 * Dipanggil NextAuth `authorize()` lewat jalur server-ke-server.
 * Mengembalikan 401 (bukan 404/400) untuk email tidak ada maupun password
 * salah, supaya tidak membocorkan email mana yang terdaftar.
 */
export async function verifyCredentials(req: Request, res: Response) {
  const parsed = credentialsSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({ error: "Kredensial tidak valid" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await db.orm.public.User.where({ email }).first();

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return res.status(401).json({ error: "Email atau password salah" });
  }

  return res.json({ id: user.id, email: user.email, name: user.name });
}
