import { Router } from "express";

import { register, verifyCredentials } from "../controllers/auth.controller";
import { requireService } from "../middleware/internal-auth";
import { createTenantLimiter } from "../middleware/rate-limit";

const router = Router();

// Publik (dipakai halaman /register), dibatasi seperti pembuatan tenant.
router.post("/auth/register", createTenantLimiter, register);

// Internal: hanya BFF Next yang tahu INTERNAL_API_SECRET.
router.post("/auth/verify-credentials", requireService, verifyCredentials);

export default router;
