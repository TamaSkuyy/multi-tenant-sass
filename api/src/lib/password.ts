import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash password dengan scrypt bawaan Node — tanpa dependensi tambahan.
 * Format tersimpan: `scrypt$<salt-base64url>$<hash-base64url>`
 */
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("base64url");

  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(
  password: string,
  stored: string | null | undefined,
): boolean {
  // Akun tanpa password (mis. OAuth murni) tidak bisa login lewat credentials.
  if (!stored) return false;

  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const candidate = scryptSync(password, salt, expected.length);

  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
