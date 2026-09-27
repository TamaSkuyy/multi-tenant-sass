import rateLimit from "express-rate-limit";

/**
 * Pembatas untuk `POST /api/tenants`.
 *
 * Endpoint ini publik (belum ada auth), jadi satu IP dibatasi 20 tenant/jam.
 * Catatan: store-nya in-memory (per proses). Kalau API dijalankan lebih dari
 * satu instance, ganti ke store bersama (mis. Redis) supaya batasnya benar.
 */
export const createTenantLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Coba lagi nanti." },
});
