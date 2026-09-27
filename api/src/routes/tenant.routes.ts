import { Router } from "express";

import {
  createTenant,
  getMyTenant,
  getTenant,
  updateMyTenant,
} from "../controllers/tenant.controller";
import { identifyUser, requireUser } from "../middleware/internal-auth";
import { createTenantLimiter } from "../middleware/rate-limit";

const router = Router();

// Daftarkan /tenants/me SEBELUM /tenants/:slug supaya tidak tertangkap ':slug'.
router.get("/tenants/me", requireUser, getMyTenant);
router.patch("/tenants/me", requireUser, updateMyTenant);

// Masih publik (form landing page), tapi identitas ikut dipasang kalau ada
// supaya tenant langsung terhubung ke pemiliknya.
router.post("/tenants", createTenantLimiter, identifyUser, createTenant);
router.get("/tenants/:slug", getTenant);

export default router;
