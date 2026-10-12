import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { etb } from "../utils/money.js";
import {
  httpError,
  parseClock,
  serializeBookingService,
  serializePackage,
  serializePlan,
  serializeSlot,
} from "../utils/billing.js";
import { bookingInclude, listBookings, presentBooking } from "../services/bookings.service.js";
import { listPayments, presentPayment } from "../services/payments.service.js";
import { creditMinutes, debitMinutes } from "../services/minutes.service.js";
import {
  ensureSingleActiveSubscription,
  expireDueSubscriptions,
  presentSubscription,
} from "../services/subscriptions.service.js";
import { listDevices, presentDevices } from "../services/devices.service.js";
import {
  getPlatformBillingConfig,
  listInvoices,
  presentInvoice,
  presentPlatformConfig,
  updatePlatformBillingConfig,
} from "../services/invoices.service.js";
import { hasUnpaidInvoice } from "../services/invoices.service.js";

function planData(body) {
  const name = String(body?.name || "").trim();
  const slug = String(body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const priceEtb = Number(body?.priceEtb);
  const maxDevices = Number(body?.maxDevices);
  if (!name) throw httpError(400, "Plan name is required");
  if (!Number.isFinite(priceEtb) || priceEtb < 0) throw httpError(400, "Price must be a number in ETB");
  if (!Number.isInteger(maxDevices) || maxDevices < 1) throw httpError(400, "Device limit must be at least 1");
  return {
    name,
    slug,
    description: body?.description || null,
    priceEtb: etb(priceEtb),
    maxDevices,
    intervalDays: Number(body?.intervalDays || 30),
    isActive: body?.isActive !== false,
    sortOrder: Number(body?.sortOrder || 0),
  };
}

function packageData(body) {
  const name = String(body?.name || "").trim();
  const slug = String(body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const minutes = Number(body?.minutes);
  const priceEtb = Number(body?.priceEtb);
  if (!name) throw httpError(400, "Package name is required");
  if (!Number.isInteger(minutes) || minutes < 1) throw httpError(400, "Minutes must be at least 1");
  if (!Number.isFinite(priceEtb) || priceEtb < 0) throw httpError(400, "Price must be a number in ETB");
  return {
    name,
    slug,
    minutes,
    priceEtb: etb(priceEtb),
    expiresInDays: body?.expiresInDays ? Number(body.expiresInDays) : null,
    isActive: body?.isActive !== false,
    sortOrder: Number(body?.sortOrder || 0),
  };
}

function serviceData(body) {
  const name = String(body?.name || "").trim();
  const slug = String(body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const pricePerHourEtb = Number(body?.pricePerHourEtb);
  if (!name) throw httpError(400, "Service name is required");
  if (!Number.isFinite(pricePerHourEtb) || pricePerHourEtb < 0) {
    throw httpError(400, "Hourly price must be a number in ETB");
  }
  return {
    name,
    slug,
    description: body?.description || null,
    callMode: body?.callMode === "voice" ? "voice" : "video",
    pricePerHourEtb: etb(pricePerHourEtb),
    isActive: body?.isActive !== false,
    sortOrder: Number(body?.sortOrder || 0),
  };
}

function slotData(body) {
  const weekday = Number(body?.weekday);
  const startMinute = body?.startTime != null ? parseClock(body.startTime) : Number(body?.startMinute);
  const endMinute = body?.endTime != null ? parseClock(body.endTime) : Number(body?.endMinute);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw httpError(400, "Weekday must be 0 (Sunday) through 6 (Saturday)");
  }
  if (startMinute == null || endMinute == null || endMinute <= startMinute) {
    throw httpError(400, "Slot end time must be after start time");
  }
  return {
    weekday,
    startMinute,
    endMinute,
    isActive: body?.isActive !== false,
  };
}

export const listCatalog = asyncHandler(async (_req, res) => {
  const [plans, packages, ondemand] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.minutePackage.findMany({ orderBy: { sortOrder: "asc" } }),
    getPlatformBillingConfig(),
  ]);
  res.json({
    plans: plans.map(serializePlan),
    packages: packages.map(serializePackage),
    ondemand: presentPlatformConfig(ondemand),
    services: [],
    slots: [],
  });
});

export const getOndemandConfig = asyncHandler(async (_req, res) => {
  const ondemand = await getPlatformBillingConfig();
  res.json({ ondemand: presentPlatformConfig(ondemand) });
});

export const updateOndemandConfig = asyncHandler(async (req, res) => {
  const ondemand = await updatePlatformBillingConfig({
    rateEtb: req.body?.rateEtb ?? req.body?.hourlyRateEtb,
    rateUnit: req.body?.rateUnit,
    enabled: req.body?.enabled,
  });
  res.json({ ondemand: presentPlatformConfig(ondemand) });
});

export const listAdminInvoices = asyncHandler(async (req, res) => {
  const invoices = await listInvoices({
    ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
    ...(req.query.status ? { status: String(req.query.status) } : {}),
  }, 200);
  res.json({ invoices: invoices.map(presentInvoice) });
});

export const createPlan = asyncHandler(async (req, res) => {
  const plan = await prisma.plan.create({ data: planData(req.body) });
  res.status(201).json({ plan: serializePlan(plan) });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const current = await prisma.plan.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Plan not found" });
  const plan = await prisma.plan.update({
    where: { id: current.id },
    data: planData({ ...current, ...req.body, priceEtb: req.body?.priceEtb ?? current.priceEtb }),
  });
  res.json({ plan: serializePlan(plan) });
});

export const createPackage = asyncHandler(async (req, res) => {
  const pkg = await prisma.minutePackage.create({ data: packageData(req.body) });
  res.status(201).json({ package: serializePackage(pkg) });
});

export const updatePackage = asyncHandler(async (req, res) => {
  const current = await prisma.minutePackage.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Package not found" });
  const pkg = await prisma.minutePackage.update({
    where: { id: current.id },
    data: packageData({ ...current, ...req.body, priceEtb: req.body?.priceEtb ?? current.priceEtb }),
  });
  res.json({ package: serializePackage(pkg) });
});

export const createService = asyncHandler(async (req, res) => {
  const service = await prisma.bookingService.create({ data: serviceData(req.body) });
  res.status(201).json({ service: serializeBookingService(service) });
});

export const updateService = asyncHandler(async (req, res) => {
  const current = await prisma.bookingService.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Service not found" });
  const service = await prisma.bookingService.update({
    where: { id: current.id },
    data: serviceData({
      ...current,
      ...req.body,
      pricePerHourEtb: req.body?.pricePerHourEtb ?? current.pricePerHourEtb,
    }),
  });
  res.json({ service: serializeBookingService(service) });
});

export const createSlot = asyncHandler(async (req, res) => {
  const slot = await prisma.bookingSlot.create({ data: slotData(req.body) });
  res.status(201).json({ slot: serializeSlot(slot) });
});

export const updateSlot = asyncHandler(async (req, res) => {
  const current = await prisma.bookingSlot.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Slot not found" });
  const slot = await prisma.bookingSlot.update({
    where: { id: current.id },
    data: slotData({ ...current, ...req.body }),
  });
  res.json({ slot: serializeSlot(slot) });
});

const SUBSCRIPTION_STATUSES = ["pending", "active", "expired", "cancelled"];
const BOOKING_STATUSES = ["pending_payment", "confirmed", "cancelled", "completed", "expired"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "cancelled"];
const PAYMENT_KINDS = ["subscription", "minute_package", "booking", "usage_invoice"];

export const listAdminSubscriptions = asyncHandler(async (req, res) => {
  await expireDueSubscriptions();
  if (req.query.status && !SUBSCRIPTION_STATUSES.includes(String(req.query.status))) {
    return res.status(400).json({ error: "Invalid subscription status" });
  }
  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
    },
    include: { plan: true, organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ subscriptions: subscriptions.map(presentSubscription) });
});

export const updateAdminSubscription = asyncHandler(async (req, res) => {
  const current = await prisma.subscription.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Subscription not found" });
  if (req.body?.status && !SUBSCRIPTION_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid subscription status" });
  }
  const data = {};
  if (req.body?.status) data.status = req.body.status;
  if (req.body?.autoRenew != null) data.autoRenew = Boolean(req.body.autoRenew);
  if (req.body?.expiresAt) data.expiresAt = new Date(req.body.expiresAt);
  if (req.body?.startsAt) data.startsAt = new Date(req.body.startsAt);
  if (data.status === "cancelled") data.cancelledAt = new Date();
  if (data.status === "active") data.cancelledAt = null;
  const subscription = await prisma.subscription.update({
    where: { id: current.id },
    data,
    include: { plan: true, organization: { select: { id: true, name: true } } },
  });
  if (subscription.status === "active") {
    await ensureSingleActiveSubscription(subscription.organizationId, subscription.id);
  }
  const fresh = await prisma.subscription.findUnique({
    where: { id: subscription.id },
    include: { plan: true, organization: { select: { id: true, name: true } } },
  });
  res.json({ subscription: presentSubscription(fresh) });
});

export const listAdminPayments = asyncHandler(async (req, res) => {
  if (req.query.status && !PAYMENT_STATUSES.includes(String(req.query.status))) {
    return res.status(400).json({ error: "Invalid payment status" });
  }
  if (req.query.kind && !PAYMENT_KINDS.includes(String(req.query.kind))) {
    return res.status(400).json({ error: "Invalid payment kind" });
  }
  const payments = await listPayments({
    ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
    ...(req.query.status ? { status: String(req.query.status) } : {}),
    ...(req.query.kind ? { kind: String(req.query.kind) } : {}),
  }, 200);
  res.json({ payments: payments.map(presentPayment) });
});

export const listAdminBalances = asyncHandler(async (_req, res) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: { minuteBalance: true },
  });
  const rows = [];
  for (const org of orgs) {
    rows.push({
      organizationId: org.id,
      name: org.name,
      remainingMinutes: org.minuteBalance ? Number(org.minuteBalance.remainingMinutes) : 0,
    });
  }
  res.json({ balances: rows });
});

export const adjustMinutes = asyncHandler(async (req, res) => {
  const organizationId = req.params.organizationId;
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return res.status(404).json({ error: "Hospital not found" });
  const minutes = Number(req.body?.minutes);
  if (!Number.isFinite(minutes) || minutes === 0) {
    return res.status(400).json({ error: "Minutes adjustment cannot be zero" });
  }
  const result = minutes > 0
    ? await creditMinutes({
        organizationId,
        minutes,
        kind: "adjustment",
        note: req.body?.note || "Admin adjustment",
      })
    : await debitMinutes({
        organizationId,
        minutes: Math.abs(minutes),
        note: req.body?.note || "Admin adjustment",
      });
  res.json({ remainingMinutes: result.remaining });
});

export const listAdminBookings = asyncHandler(async (req, res) => {
  if (req.query.status && !BOOKING_STATUSES.includes(String(req.query.status))) {
    return res.status(400).json({ error: "Invalid booking status" });
  }
  const bookings = await listBookings({
    ...(req.query.organizationId ? { organizationId: String(req.query.organizationId) } : {}),
    ...(req.query.status ? { status: String(req.query.status) } : {}),
  }, 200);
  res.json({ bookings: bookings.map(presentBooking) });
});

export const updateAdminBooking = asyncHandler(async (req, res) => {
  const current = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Booking not found" });
  if (req.body?.status && !BOOKING_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid booking status" });
  }
  const data = {};
  if (req.body?.status) data.status = req.body.status;
  if (req.body?.translatorId !== undefined) data.translatorId = req.body.translatorId || null;
  const booking = await prisma.booking.update({
    where: { id: current.id },
    data,
    include: bookingInclude(),
  });
  res.json({ booking: presentBooking(booking) });
});

export const listAdminDevices = asyncHandler(async (req, res) => {
  const organizationId = String(req.query.organizationId || "");
  if (!organizationId) return res.status(400).json({ error: "organizationId is required" });
  const devices = await listDevices(organizationId);
  res.json(presentDevices(devices, null));
});

export const hospitalBillingOverview = asyncHandler(async (_req, res) => {
  await expireDueSubscriptions();
  const config = await getPlatformBillingConfig();
  const organizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      minuteBalance: true,
      subscriptions: {
        where: { status: "active" },
        include: { plan: true },
        take: 1,
      },
      devices: { where: { isActive: true } },
    },
  });
  const hospitals = [];
  for (const org of organizations) {
    const unpaid = await hasUnpaidInvoice(org.id);
    const remainingMinutes = org.minuteBalance ? Number(org.minuteBalance.remainingMinutes) : 0;
    const subscription = org.subscriptions[0] ? presentSubscription(org.subscriptions[0]) : null;
    let activeMode = "none";
    if (unpaid) activeMode = "blocked";
    else if (subscription) activeMode = "subscription";
    else if (remainingMinutes > 0) activeMode = "minutes";
    else if (config.enabled) activeMode = "ondemand";
    hospitals.push({
      id: org.id,
      name: org.name,
      remainingMinutes,
      subscription,
      activeMode,
      activeDevices: org.devices.length,
      unpaidInvoice: unpaid
        ? { id: unpaid.id, periodKey: unpaid.periodKey, totalEtb: Number(unpaid.totalEtb) }
        : null,
    });
  }
  res.json({ hospitals });
});
