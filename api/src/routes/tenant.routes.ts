import { Router } from "express";
import { createTenant, getTenant } from "../controllers/tenant.controller";

const router = Router();

router.post("/tenants", createTenant);
router.get("/tenants/:slug", getTenant);

export default router;
