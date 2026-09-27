import type { Request, Response } from "express";

import { db } from "../prisma/db";

export async function createTenant(req: Request, res: Response) {
  // req.body bisa undefined (request tanpa body) di Express 5 — jangan
  // langsung didestrukturisasi.
  const { name, bio, skills } = (req.body ?? {}) as {
    name?: unknown;
    bio?: unknown;
    skills?: unknown;
  };

  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    typeof bio !== "string" ||
    bio.trim() === "" ||
    !Array.isArray(skills) ||
    !skills.every((skill): skill is string => typeof skill === "string")
  ) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  // "Budi Santoso!" → "budi-santoso"
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug === "") {
    return res.status(400).json({ error: "Name cannot produce a valid slug" });
  }

  const existing = await db.orm.public.Tenant.where({ slug }).first();

  if (existing) {
    return res.status(409).json({ error: "Slug already exists", slug });
  }

  const template = await db.orm.public.Template.first();

  if (!template) {
    return res.status(500).json({ error: "No template found" });
  }

  const tenant = await db.orm.public.Tenant.create({
    slug,
    name: name.trim(),
    bio,
    skills,
    templateId: template.id,
  });

  return res.status(201).json({ slug: tenant.slug });
}

export async function getTenant(req: Request, res: Response) {
  const slug = req.params.slug;

  // Express 5 mengetik params sebagai string | string[] (param berulang),
  // jadi harus di-narrow dulu sebelum dipakai.
  if (typeof slug !== "string" || slug.trim() === "") {
    return res.status(400).json({ error: "Invalid slug parameter" });
  }

  const tenant = await db.orm.public.Tenant.where({ slug }).first();

  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  const template = await db.orm.public.Template
    .where({ id: tenant.templateId })
    .first();

  return res.json({ tenant, template });
}
