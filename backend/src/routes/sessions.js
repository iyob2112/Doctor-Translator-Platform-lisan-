import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, roleGuard } from "../middleware/auth.js";
import {
  createSession,
  requestTranslator,
  transferSession,
  addNotes,
  rateSession,
  endSession,
  getSession,
  listSessions,
  getCallToken,
  listUnmatched,
  acknowledgeUnmatched,
  listMessages,
  createMessage,
} from "../controllers/sessions.controller.js";

const router = Router();
router.use(requireAuth);

const requestLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many translator requests. Please wait a moment." },
});

router.get("/", listSessions);
router.get("/unmatched", roleGuard("admin", "subadmin", "hospital_admin"), listUnmatched);
router.post("/", roleGuard("hospital_admin", "doctor"), createSession);
router.post("/:id/request-translator", roleGuard("hospital_admin", "doctor"), requestLimiter, requestTranslator);
router.post("/:id/transfer", roleGuard("hospital_admin", "doctor", "translator"), transferSession);
router.patch("/:id/notes", roleGuard("translator"), addNotes);
router.post("/:id/rating", roleGuard("hospital_admin", "doctor"), rateSession);
router.post("/:id/end", endSession);
router.post("/:id/call-token", getCallToken);
router.get("/:id/messages", listMessages);
router.post("/:id/messages", roleGuard("hospital_admin", "doctor", "translator", "admin", "subadmin"), createMessage);
router.patch("/:id/unmatched-ack", roleGuard("admin", "subadmin", "hospital_admin"), acknowledgeUnmatched);
router.get("/:id", getSession);

export default router;
