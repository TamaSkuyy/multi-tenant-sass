import { Router } from "express";

import { createTenant, getTenant } from "../controllers/tenant.controller";
import { createTenantLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/tenants", createTenantLimiter, createTenant);
router.get("/tenants/:slug", getTenant);

export default router;
