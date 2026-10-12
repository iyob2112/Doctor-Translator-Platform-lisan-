import { Router } from "express";
import { requireAuth, roleGuard } from "../middleware/auth.js";
import {
  checkoutBooking,
  checkoutInvoice,
  checkoutMinutes,
  checkoutSubscription,
  chapaWebhook,
  getBillingCatalog,
  getBillingMe,
  getPayment,
  mockChapa,
  myBookings,
  myInvoices,
  myPayments,
  patchAutoRenew,
  quoteBooking,
  registerDevice,
  removeDevice,
  verifyPayment,
} from "../controllers/billing.controller.js";

const router = Router();

router.post("/chapa/webhook", chapaWebhook);
router.get("/chapa/webhook", chapaWebhook);

router.use(requireAuth, roleGuard("hospital_admin", "admin"));

router.get("/catalog", getBillingCatalog);
router.get("/me", getBillingMe);
router.post("/devices", roleGuard("hospital_admin"), registerDevice);
router.delete("/devices/:id", roleGuard("hospital_admin"), removeDevice);
router.post("/subscriptions", roleGuard("hospital_admin"), checkoutSubscription);
router.patch("/subscriptions/auto-renew", roleGuard("hospital_admin"), patchAutoRenew);
router.post("/minutes", roleGuard("hospital_admin"), checkoutMinutes);
router.post("/bookings/quote", roleGuard("hospital_admin"), quoteBooking);
router.post("/bookings", roleGuard("hospital_admin"), checkoutBooking);
router.get("/bookings", myBookings);
router.get("/invoices", roleGuard("hospital_admin"), myInvoices);
router.post("/invoices/pay", roleGuard("hospital_admin"), checkoutInvoice);
router.get("/payments", myPayments);
router.get("/payments/:txRef", getPayment);
router.post("/payments/:txRef/verify", verifyPayment);
router.post("/chapa/mock", mockChapa);

export default router;
