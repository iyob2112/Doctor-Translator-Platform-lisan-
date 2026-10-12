import { prisma } from "../config/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import { hospitalBillingSnapshot } from "../services/access.service.js";
import { deactivateDevice, listDevices, presentDevices, registerOrTouchDevice } from "../services/devices.service.js";
import { getActiveSubscription, listSubscriptions, presentSubscription, setAutoRenew } from "../services/subscriptions.service.js";
import { listMinuteHistory, remainingMinutes } from "../services/minutes.service.js";
import {
  bookingInclude,
  createPendingBooking,
  listBookings,
  presentBooking,
  quoteOnDemandBooking,
} from "../services/bookings.service.js";
import {
  assertOwnPayment,
  completeMockPayment,
  createPendingPayment,
  listPayments,
  presentPayment,
  verifyAndFulfillPayment,
} from "../services/payments.service.js";
import {
  serializePackage,
  serializePlan,
  httpError,
} from "../utils/billing.js";
import {
  assertInvoiceCheckoutAllowed,
  findCurrentInvoice,
  getInvoiceForOrg,
  getOrCreateOpenInvoice,
  getPlatformBillingConfig,
  listInvoices,
  presentInvoice,
  presentPlatformConfig,
} from "../services/invoices.service.js";
import { etb } from "../utils/money.js";

function requireHospital(req) {
  if (!req.user.organizationId) {
    throw httpError(400, "Hospital account is not assigned to a hospital");
  }
  return req.user.organizationId;
}

function deviceFingerprint(req) {
  return String(req.body?.fingerprint || req.headers["x-device-fingerprint"] || "").trim();
}

export const getBillingCatalog = asyncHandler(async (_req, res) => {
  const [plans, packages, ondemand] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.minutePackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getPlatformBillingConfig(),
  ]);
  res.json({
    currency: "ETB",
    mockPayments: env.chapaMock,
    plans: plans.map(serializePlan),
    packages: packages.map(serializePackage),
    ondemand: presentPlatformConfig(ondemand),
    services: [],
    slots: [],
    translators: [],
  });
});

export const getBillingMe = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const fingerprint = deviceFingerprint(req);
  const snapshot = await hospitalBillingSnapshot(organizationId, fingerprint);
  const [history, payments, invoices, currentInvoice, subscriptions] = await Promise.all([
    listMinuteHistory(organizationId),
    listPayments({ organizationId }, 40),
    listInvoices({ organizationId }, 24),
    findCurrentInvoice(organizationId),
    listSubscriptions(organizationId),
  ]);
  res.json({
    currency: "ETB",
    mockPayments: env.chapaMock,
    activeMode: snapshot.activeMode,
    remainingMinutes: snapshot.remainingMinutes,
    minutesPaused: Boolean(snapshot.subscription && snapshot.remainingMinutes > 0),
    subscription: presentSubscription(snapshot.subscription),
    subscriptions: subscriptions.map(presentSubscription),
    ...presentDevices(snapshot.devices, snapshot.maxDevices),
    payments: payments.map(presentPayment),
    ondemand: snapshot.ondemand,
    unpaidInvoice: snapshot.unpaidInvoice,
    currentInvoice: presentInvoice(currentInvoice),
    invoices: invoices.map(presentInvoice),
    bookings: [],
    upcomingBookings: [],
    previousBookings: [],
    minuteHistory: history,
  });
});

export const registerDevice = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const fingerprint = deviceFingerprint(req);
  const subscription = await getActiveSubscription(organizationId);
  const { device } = await registerOrTouchDevice({
    organizationId,
    fingerprint,
    label: req.body?.label,
    userAgent: req.headers["user-agent"],
    maxDevices: subscription?.plan?.maxDevices,
    enforceLimit: Boolean(subscription),
  });
  const devices = await listDevices(organizationId);
  res.json({
    device: presentDevices([device], subscription?.plan?.maxDevices).devices[0],
    ...presentDevices(devices, subscription?.plan?.maxDevices),
  });
});

export const removeDevice = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  await deactivateDevice(organizationId, req.params.id);
  const subscription = await getActiveSubscription(organizationId);
  const devices = await listDevices(organizationId);
  res.json(presentDevices(devices, subscription?.plan?.maxDevices));
});

export const checkoutSubscription = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  if (!req.body?.planId) return res.status(400).json({ error: "planId is required" });
  const plan = await prisma.plan.findUnique({ where: { id: req.body.planId } });
  if (!plan || !plan.isActive) return res.status(404).json({ error: "Plan not found" });

  const current = await getActiveSubscription(organizationId);
  const action = String(req.body?.action || "").toLowerCase() || (current ? "change" : "subscribe");
  if (current && action === "subscribe") {
    return res.status(409).json({
      error: "This hospital already has an active plan. Renew it or switch to another plan.",
    });
  }

  // Drop stale unpaid plan checkouts so only one pending plan payment is open.
  await prisma.subscription.updateMany({
    where: { organizationId, status: "pending" },
    data: { status: "cancelled", cancelledAt: new Date(), autoRenew: false },
  });

  const pending = await prisma.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      createdById: req.user.id,
      status: "pending",
    },
  });
  const payment = await createPendingPayment({
    req,
    user: req.user,
    organizationId,
    kind: "subscription",
    amountEtb: plan.priceEtb,
    title: "Lisan",
    description: plan.name,
    planId: plan.id,
    subscriptionId: pending.id,
    metadata: { action: current ? (current.planId === plan.id ? "renew" : "change") : "subscribe" },
  });
  res.status(201).json({ payment: presentPayment(payment), checkoutUrl: payment.checkoutUrl });
});

export const patchAutoRenew = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const subscription = await setAutoRenew(organizationId, req.body?.autoRenew);
  res.json({ subscription: presentSubscription(subscription) });
});

export const checkoutMinutes = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  if (!req.body?.packageId) return res.status(400).json({ error: "packageId is required" });
  const pkg = await prisma.minutePackage.findUnique({ where: { id: req.body.packageId } });
  if (!pkg || !pkg.isActive) return res.status(404).json({ error: "Package not found" });
  const payment = await createPendingPayment({
    req,
    user: req.user,
    organizationId,
    kind: "minute_package",
    amountEtb: pkg.priceEtb,
    title: "Lisan",
    description: pkg.name,
    packageId: pkg.id,
  });
  res.status(201).json({ payment: presentPayment(payment), checkoutUrl: payment.checkoutUrl });
});

export const quoteBooking = asyncHandler(async (req, res) => {
  requireHospital(req);
  const quote = await quoteOnDemandBooking(req.body || {});
  res.json({
    quote: {
      date: quote.date,
      startTime: quote.startTime,
      endTime: quote.endTime,
      startsAt: quote.startsAt,
      endsAt: quote.endsAt,
      durationMinutes: quote.durationMinutes,
      priceEtb: quote.priceEtb,
      currency: "ETB",
      service: {
        id: quote.service.id,
        name: quote.service.name,
        callMode: quote.service.callMode,
        pricePerHourEtb: Number(quote.service.pricePerHourEtb),
      },
      language: { id: quote.language.id, name: quote.language.name },
      translator: quote.translator,
    },
  });
});

export const checkoutBooking = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const { booking, quote } = await createPendingBooking({
    organizationId,
    bookedById: req.user.id,
    ...(req.body || {}),
  });
  const payment = await createPendingPayment({
    req,
    user: req.user,
    organizationId,
    kind: "booking",
    amountEtb: quote.priceEtb,
    title: "Lisan",
    description: booking.service.name,
    bookingId: booking.id,
  });
  res.status(201).json({
    booking: presentBooking(booking),
    payment: presentPayment(payment),
    checkoutUrl: payment.checkoutUrl,
  });
});

export const myBookings = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const bookings = await listBookings({ organizationId });
  res.json({ bookings: bookings.map(presentBooking) });
});

export const myInvoices = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const invoices = await listInvoices({ organizationId });
  const currentInvoice = await findCurrentInvoice(organizationId);
  res.json({
    invoices: invoices.map(presentInvoice),
    currentInvoice: presentInvoice(currentInvoice),
    ondemand: presentPlatformConfig(await getPlatformBillingConfig()),
  });
});

export const checkoutInvoice = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const invoiceId = req.body?.invoiceId || req.params.id;
  if (!invoiceId) throw httpError(400, "invoiceId is required");
  const invoice = await assertInvoiceCheckoutAllowed(invoiceId, organizationId);
  const amount = etb(invoice.totalEtb);
  if (amount <= 0) throw httpError(400, "Invoice has nothing to pay");
  const payment = await createPendingPayment({
    req,
    user: req.user,
    organizationId,
    kind: "usage_invoice",
    amountEtb: amount,
    title: "Lisan",
    description: `On-demand usage ${invoice.periodKey}`,
    invoiceId: invoice.id,
    metadata: { periodKey: invoice.periodKey },
  });
  res.status(201).json({
    invoice: presentInvoice(invoice),
    payment: presentPayment(payment),
    checkoutUrl: payment.checkoutUrl,
  });
});

export const myPayments = asyncHandler(async (req, res) => {
  const organizationId = requireHospital(req);
  const payments = await listPayments({ organizationId });
  res.json({ payments: payments.map(presentPayment) });
});

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { txRef: req.params.txRef },
    include: {
      plan: true,
      package: true,
      booking: { include: bookingInclude() },
    },
  });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  assertOwnPayment(payment, req.user);
  res.json({ payment: presentPayment(payment) });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const existing = await prisma.payment.findUnique({ where: { txRef: req.params.txRef } });
  if (!existing) return res.status(404).json({ error: "Payment not found" });
  assertOwnPayment(existing, req.user);
  const { payment, alreadyProcessed, pending } = await verifyAndFulfillPayment(req.params.txRef);
  res.json({
    payment: presentPayment(payment),
    alreadyProcessed,
    pending: Boolean(pending),
    remainingMinutes: existing.organizationId ? await remainingMinutes(existing.organizationId) : null,
  });
});

export const chapaWebhook = asyncHandler(async (req, res) => {
  const txRef = req.body?.trx_ref || req.body?.tx_ref || req.query?.trx_ref || req.query?.tx_ref;
  if (!txRef) return res.status(400).json({ error: "tx_ref is required" });
  const result = await verifyAndFulfillPayment(String(txRef));
  res.json({ ok: true, alreadyProcessed: result.alreadyProcessed, status: result.payment.status });
});

export const mockChapa = asyncHandler(async (req, res) => {
  if (!env.chapaMock) {
    return res.status(403).json({ error: "Mock payments are disabled" });
  }
  const txRef = req.body?.txRef || req.body?.tx_ref || req.query?.tx_ref;
  const result = req.body?.result || req.query?.result || "success";
  if (!txRef) return res.status(400).json({ error: "tx_ref is required" });
  const existing = await prisma.payment.findUnique({ where: { txRef: String(txRef) } });
  if (!existing) return res.status(404).json({ error: "Payment not found" });
  if (req.user) assertOwnPayment(existing, req.user);
  const out = await completeMockPayment(String(txRef), result);
  res.json({ payment: presentPayment(out.payment), alreadyProcessed: out.alreadyProcessed });
});
