import { createHmac } from "node:crypto";

/**
 * Penanda tangan identitas untuk komunikasi BFF (Next) → API Express.
 * Format token `<subject>.<exp>.<hmac>`; API memverifikasinya dengan rahasia
 * yang sama (api/.env INTERNAL_API_SECRET).
 *
 * File ini server-only — jangan pernah diimpor dari komponen "use client".
 */
const TTL_MS = 5 * 60_000;

function secret(): string {
  const value = process.env.INTERNAL_API_SECRET ?? "";

  if (value.length < 16) {
    throw new Error(
      "INTERNAL_API_SECRET belum di-set di client/.env.local — nilainya harus SAMA dengan api/.env",
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
