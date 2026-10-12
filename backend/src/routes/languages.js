import { Router } from "express";
import { requireAuth, roleGuard, permissionGuard } from "../middleware/auth.js";
import { listLanguages, createLanguage } from "../controllers/languages.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/", listLanguages);
router.post("/", roleGuard("admin", "subadmin"), permissionGuard("languages.manage"), createLanguage);

export default router;
