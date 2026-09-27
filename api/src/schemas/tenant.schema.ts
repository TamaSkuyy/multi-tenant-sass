import { z } from "zod";

/**
 * Skema body untuk pembuatan tenant. Dipakai sebelum menyentuh database,
 * sehingga data kotor ditolak dengan 400 + detail per field.
 */
export const createTenantSchema = z.object({
  name: z
    .string("Nama wajib berupa teks")
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(80, "Nama maksimal 80 karakter"),
  bio: z
    .string("Bio wajib berupa teks")
    .trim()
    .min(1, "Bio wajib diisi")
    .max(1000, "Bio maksimal 1000 karakter"),
  skills: z
    .array(
      z
        .string("Setiap skill wajib berupa teks")
        .trim()
        .min(1, "Skill tidak boleh kosong")
        .max(40, "Skill maksimal 40 karakter"),
    )
    .min(1, "Minimal satu skill")
    .max(20, "Maksimal 20 skill"),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
