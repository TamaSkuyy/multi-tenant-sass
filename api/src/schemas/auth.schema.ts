import { z } from "zod";

/** Body `POST /api/auth/register`. Email dinormalisasi di controller. */
export const registerSchema = z.object({
  email: z.email("Email tidak valid"),
  password: z
    .string("Password wajib berupa teks")
    .min(8, "Password minimal 8 karakter")
    .max(200, "Password maksimal 200 karakter"),
  name: z
    .string("Nama wajib berupa teks")
    .trim()
    .min(1, "Nama minimal 1 karakter")
    .max(80, "Nama maksimal 80 karakter")
    .optional(),
});

/** Body `POST /api/auth/verify-credentials` (dipakai NextAuth `authorize`). */
export const credentialsSchema = z.object({
  email: z.string("Email wajib diisi").min(1, "Email wajib diisi"),
  password: z.string("Password wajib diisi").min(1, "Password wajib diisi"),
});
