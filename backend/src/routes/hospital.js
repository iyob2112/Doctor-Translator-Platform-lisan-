import { Router } from "express";
import { requireAuth, roleGuard } from "../middleware/auth.js";
import {
  getHospital,
  createHospitalDepartment,
  listHospitalSessions,
} from "../controllers/hospital.controller.js";

const router = Router();
router.use(requireAuth, roleGuard("hospital_admin"));

router.get("/", getHospital);
router.post("/departments", createHospitalDepartment);
router.get("/sessions", listHospitalSessions);

export default router;
