import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tanda tangan internal untuk komunikasi Next (BFF) → API.
 *
 * Format token: `<subject>.<exp>.<hmac>` di header `x-internal-token`.
 * - subject `service` = panggilan server-ke-server tanpa user (mis. verifikasi
 *   kredensial saat login).
 * - subject lain = id user yang sudah login (dipakai endpoint /tenants/me).
 *
 * API tidak mempercayai header identitas mentah: hanya pemegang
 * INTERNAL_API_SECRET yang bisa membuat token valid, jadi API boleh tetap
 * terekspos tanpa celah "ganti saja header-nya".
 */
const TTL_MS = 5 * 60_000;

function secret(): string {
  const value = process.env.INTERNAL_API_SECRET ?? "";

  if (value.length < 16) {
    throw new Error(
      "INTERNAL_API_SECRET belum di-set (min 16 karakter) — lihat api/.env.example",
    );
  }

  return value;
}

export function signInternalCall(subject: string, ttlMs = TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = `${subject}.${exp}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyInternalCall(token: string | undefined): { subject: string } | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [subject, expRaw, signature] = parts;
  const exp = Number(expRaw);

  if (!subject || !Number.isFinite(exp) || exp < Date.now()) return null;

  const expected = createHmac("sha256", secret())
    .update(`${subject}.${exp}`)
    .digest("base64url");

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);

  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  return { subject };
}
