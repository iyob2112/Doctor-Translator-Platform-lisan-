import { Router } from "express";
import { requireAuth, roleGuard, permissionGuard } from "../middleware/auth.js";
import {
  listPermissions,
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  deleteUser,
  activateUser,
  resetUserPassword,
  setTranslatorApproval,
  setTranslatorFlag,
  getTranslator,
  listOrganizations,
  createOrganization,
  listDepartments,
  createDepartment,
  listWithdrawals,
  reviewWithdrawal,
} from "../controllers/admin.controller.js";
import {
  adjustMinutes,
  createPackage,
  createPlan,
  createService,
  createSlot,
  getOndemandConfig,
  hospitalBillingOverview,
  listAdminBalances,
  listAdminBookings,
  listAdminDevices,
  listAdminInvoices,
  listAdminPayments,
  listAdminSubscriptions,
  listCatalog,
  updateAdminBooking,
  updateAdminSubscription,
  updateOndemandConfig,
  updatePackage,
  updatePlan,
  updateService,
  updateSlot,
} from "../controllers/admin-billing.controller.js";

const router = Router();
router.use(requireAuth, roleGuard("admin", "subadmin"));

router.get("/permissions", listPermissions);
router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.patch("/users/:id/deactivate", deactivateUser);
router.delete("/users/:id", deleteUser);
router.patch("/users/:id/activate", activateUser);
router.patch("/users/:id/reset-password", resetUserPassword);
router.patch("/translators/:id/approval", permissionGuard("translators.manage"), setTranslatorApproval);
router.patch("/translators/:id/flag", permissionGuard("translators.manage"), setTranslatorFlag);
router.get("/translators/:id", permissionGuard("translators.create", "translators.manage"), getTranslator);
router.get("/organizations", permissionGuard("hospitals.manage"), listOrganizations);
router.post("/organizations", permissionGuard("hospitals.manage"), createOrganization);
router.get("/departments", permissionGuard("hospitals.manage"), listDepartments);
router.post("/departments", permissionGuard("hospitals.manage"), createDepartment);
router.get("/withdrawals", permissionGuard("payouts.review"), listWithdrawals);
router.patch("/withdrawals/:id", permissionGuard("payouts.review"), reviewWithdrawal);
router.use("/billing", permissionGuard("billing.manage"));
router.get("/billing/catalog", listCatalog);
router.post("/billing/plans", createPlan);
router.patch("/billing/plans/:id", updatePlan);
router.post("/billing/packages", createPackage);
router.patch("/billing/packages/:id", updatePackage);
router.post("/billing/services", createService);
router.patch("/billing/services/:id", updateService);
router.post("/billing/slots", createSlot);
router.patch("/billing/slots/:id", updateSlot);
router.get("/billing/overview", hospitalBillingOverview);
router.get("/billing/subscriptions", listAdminSubscriptions);
router.patch("/billing/subscriptions/:id", updateAdminSubscription);
router.get("/billing/payments", listAdminPayments);
router.get("/billing/balances", listAdminBalances);
router.patch("/billing/balances/:organizationId", adjustMinutes);
router.get("/billing/bookings", listAdminBookings);
router.patch("/billing/bookings/:id", updateAdminBooking);
router.get("/billing/ondemand", getOndemandConfig);
router.patch("/billing/ondemand", updateOndemandConfig);
router.get("/billing/invoices", listAdminInvoices);
router.get("/billing/devices", listAdminDevices);

export default router;
