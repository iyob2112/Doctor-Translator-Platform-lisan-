import { Router } from "express";
import { requireAuth, roleGuard } from "../middleware/auth.js";
import {
  getMe,
  updateLanguages,
  updateAvailability,
  getEarnings,
  requestWithdrawal,
  updatePayoutAccount,
} from "../controllers/translators.controller.js";

const router = Router();
router.use(requireAuth, roleGuard("translator"));

router.get("/me", getMe);
router.get("/me/earnings", getEarnings);
router.post("/me/withdrawals", requestWithdrawal);
router.patch("/me/payout-account", updatePayoutAccount);
router.patch("/me/languages", updateLanguages);
router.patch("/me/availability", updateAvailability);

export default router;
