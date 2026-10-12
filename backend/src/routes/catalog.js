import { Router } from "express";
import { publicCatalog } from "../controllers/catalog.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.get("/", requireAuth, publicCatalog);

export default router;
