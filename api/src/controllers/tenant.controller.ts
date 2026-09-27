import type { JsonValue } from "@prisma/orm-postgres/target/codec-types";
import type { Request, Response } from "express";

import { db } from "../prisma/db";
import { createTenantSchema, updateTenantSchema } from "../schemas/tenant.schema";

function details(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

export async function createTenant(req: Request, res: Response) {
  const parsed = createTenantSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Data tenant tidak valid",
      details: details(parsed.error.issues),
    });
  }

  const { name, bio, skills } = parsed.data;

  // "Budi Santoso!" → "budi-santoso"
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug === "") {
    return res.status(400).json({ error: "Name cannot produce a valid slug" });
  }

  // Satu akun = satu portfolio. `req.userId` hanya terisi kalau request datang
  // lewat BFF yang sudah login (lihat middleware identifyUser).
  if (req.userId) {
    const mine = await db.orm.public.Tenant.where({ ownerId: req.userId }).first();

    if (mine) {
      return res
        .status(409)
        .json({ error: "Akun ini sudah punya portfolio", slug: mine.slug });
    }
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
    name,
    bio,
    skills,
    templateId: template.id,
    ownerId: req.userId ?? null,
  });

  return res.status(201).json({ slug: tenant.slug, ownerId: tenant.ownerId });
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

/** Tenant milik user yang sedang login (null kalau belum punya). */
export async function getMyTenant(req: Request, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ error: "Butuh login" });
  }

  const tenant = await db.orm.public.Tenant.where({ ownerId: req.userId }).first();

  return res.json({ tenant: tenant ?? null });
}

/** Update bio/skills/nama + override section milik user yang login. */
export async function updateMyTenant(req: Request, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ error: "Butuh login" });
  }

  const parsed = updateTenantSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Data tenant tidak valid",
      details: details(parsed.error.issues),
    });
  }

  const { name, bio, skills, sections } = parsed.data;

  if (
    name === undefined &&
    bio === undefined &&
    skills === undefined &&
    sections === undefined
  ) {
    return res.status(400).json({ error: "Tidak ada field yang dikirim" });
  }

  const tenant = await db.orm.public.Tenant.where({ ownerId: req.userId }).first();

  if (!tenant) {
    return res.status(404).json({ error: "Tenant belum ada untuk akun ini" });
  }

  const patch: {
    name?: string;
    bio?: string;
    skills?: string[];
    config?: JsonValue;
  } = {};

  if (name !== undefined) patch.name = name;
  if (bio !== undefined) patch.bio = bio;
  if (skills !== undefined) patch.skills = skills;

  if (sections !== undefined) {
    const current = (tenant.config ?? {}) as Record<string, JsonValue>;
    const currentSections = current.sections as Record<string, JsonValue> | undefined;

    patch.config = {
      ...current,
      sections: { ...currentSections, ...sections },
    } satisfies JsonValue;
  }

  const updated = await db.orm.public.Tenant.where({ id: tenant.id }).update(patch);

  return res.json({ tenant: updated });
}
