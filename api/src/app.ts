import cors from "cors";
import express from "express";
import type { ErrorRequestHandler, RequestHandler } from "express";
import tenantRoutes from "./routes/tenant.routes";

import { db } from "./prisma/db";

const app = express();

// ---------------------------------------------------------------- middleware
app.use(cors());
app.use(express.json());

//---------------------------------------------------------------- routes
app.use("/api", tenantRoutes);

// ---------------------------------------------------------------- routes
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Contoh pemakaian Prisma 8: db.orm.public.<Model>.
// Ganti / hapus sesuai kebutuhan route-mu.
const listTemplates: RequestHandler = async (_req, res, next) => {
  try {
    const templates = await db.orm.public.Template.select(
      "id",
      "name",
      "config",
    ).all();

    res.json({ data: templates });
  } catch (error) {
    next(error);
  }
};

app.get("/api/templates", listTemplates);

// ---------------------------------------------------------------- readiness
// /health = liveness (server hidup). /ready = readiness (DB benar-benar bisa
// dipakai) — jangan pakai /health untuk probe DB, dia tidak menyentuh database.
app.get("/ready", async (_req, res) => {
  try {
    await db.orm.public.Template.limit(1).all();
    res.json({ ok: true, database: "up" });
  } catch (error) {
    console.error("Readiness check gagal:", error);
    res.status(503).json({ ok: false, database: "down" });
  }
});

// ---------------------------------------------------------------- 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ---------------------------------------------------------------- error handler
// Wajib 4 argumen, kalau tidak Express menganggapnya middleware biasa.
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Body JSON rusak → 400, bukan 500.
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  // Unique violation Postgres (23505), mis. dua request slug sama berbarengan.
  if ((error as { sqlState?: unknown }).sqlState === "23505") {
    res.status(409).json({ error: "Resource already exists" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

export default app;
