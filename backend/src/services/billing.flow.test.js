import "./force-chapa-mock.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import { assertHospitalCanStartConsult } from "./access.service.js";
import { completeMockPayment, createPendingPayment, verifyAndFulfillPayment } from "./payments.service.js";
import { creditMinutes, debitMinutes, remainingMinutes } from "./minutes.service.js";
import { ensureSingleActiveSubscription, expireDueSubscriptions } from "./subscriptions.service.js";
import { createPendingBooking, findTranslatorConflicts, hasBookingConflict } from "./bookings.service.js";
import { deactivateDevice, registerOrTouchDevice } from "./devices.service.js";
import {
  assertInvoiceCheckoutAllowed,
  closeDueInvoices,
  getOrCreateOpenInvoice,
  monthPeriod,
  recordSessionUsage,
  updatePlatformBillingConfig,
} from "./invoices.service.js";
import { usageAmountEtb } from "../utils/billing.js";

const req = {
  protocol: "http",
  get: () => "localhost:4000",
  headers: { origin: "http://localhost:5173" },
};

let org;
let hospitalUser;
let translator;
let language;
let plan3;
let plan5;
let pkg;
let service;

async function cleanup() {
  if (!org) return;
  await prisma.minuteTransaction.deleteMany({ where: { organizationId: org.id } });
  await prisma.payment.deleteMany({ where: { organizationId: org.id } });
  await prisma.usageLine.deleteMany({ where: { invoice: { organizationId: org.id } } });
  await prisma.usageInvoice.deleteMany({ where: { organizationId: org.id } });
  await prisma.booking.deleteMany({ where: { organizationId: org.id } });
  await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
  await prisma.device.deleteMany({ where: { organizationId: org.id } });
  await prisma.minuteBalance.deleteMany({ where: { organizationId: org.id } });
  await prisma.session.deleteMany({ where: { organizationId: org.id } });
  await updatePlatformBillingConfig({ rateEtb: 400, rateUnit: "hour", enabled: true });
}

before(async () => {
  plan3 = await prisma.plan.upsert({
    where: { slug: "monthly-3-devices" },
    update: { priceEtb: 2000, maxDevices: 3, isActive: true },
    create: { slug: "monthly-3-devices", name: "Monthly — 3 Devices", priceEtb: 2000, maxDevices: 3, sortOrder: 1 },
  });
  plan5 = await prisma.plan.upsert({
    where: { slug: "monthly-5-devices" },
    update: { priceEtb: 2500, maxDevices: 5, isActive: true },
    create: { slug: "monthly-5-devices", name: "Monthly — 5 Devices", priceEtb: 2500, maxDevices: 5, sortOrder: 2 },
  });
  pkg = await prisma.minutePackage.upsert({
    where: { slug: "minutes-1000" },
    update: { minutes: 1000, priceEtb: 500, isActive: true },
    create: { slug: "minutes-1000", name: "1,000 Minutes", minutes: 1000, priceEtb: 500, sortOrder: 2 },
  });
  service = await prisma.bookingService.upsert({
    where: { slug: "video-interpretation" },
    update: { pricePerHourEtb: 400, isActive: true },
    create: {
      slug: "video-interpretation",
      name: "Video interpretation",
      callMode: "video",
      pricePerHourEtb: 400,
    },
  });
  const slotCount = await prisma.bookingSlot.count();
  if (!slotCount) {
    await prisma.bookingSlot.create({ data: { weekday: 5, startMinute: 8 * 60, endMinute: 18 * 60 } });
  }
  language = await prisma.language.upsert({
    where: { code: "es" },
    update: {},
    create: { code: "es", name: "Spanish" },
  });
  org = await prisma.organization.create({ data: { name: `Billing Test Hospital ${Date.now()}` } });
  hospitalUser = await prisma.user.create({
    data: {
      email: `billing-hospital-${Date.now()}@test.local`,
      passwordHash: await bcrypt.hash("Hospital123!", 8),
      fullName: "Test Hospital",
      role: "hospital_admin",
      organizationId: org.id,
    },
  });
  translator = await prisma.user.create({
    data: {
      email: `billing-translator-${Date.now()}@test.local`,
      passwordHash: await bcrypt.hash("Translator123!", 8),
      fullName: "Test Translator",
      role: "translator",
      translatorProfile: { create: { approvalStatus: "approved" } },
    },
  });
});

after(async () => {
  await cleanup();
  if (translator) {
    await prisma.translatorProfile.deleteMany({ where: { userId: translator.id } });
    await prisma.user.deleteMany({ where: { id: { in: [hospitalUser.id, translator.id] } } });
  }
  if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("Chapa payment fulfillment", () => {
  it("activates a monthly plan only after successful verification and is idempotent", async () => {
    await cleanup();
    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "subscription",
      amountEtb: plan3.priceEtb,
      title: "Lisan",
      description: plan3.name,
      planId: plan3.id,
    });
    assert.equal(payment.status, "pending");
    const first = await completeMockPayment(payment.txRef, "success");
    assert.equal(first.payment.status, "paid");
    const sub = await prisma.subscription.findFirst({ where: { organizationId: org.id, status: "active" } });
    assert.ok(sub);
    assert.equal(sub.planId, plan3.id);

    const second = await verifyAndFulfillPayment(payment.txRef);
    assert.equal(second.alreadyProcessed, true);
    assert.equal(second.payment.status, "paid");
    const count = await prisma.subscription.count({ where: { organizationId: org.id, status: "active" } });
    assert.equal(count, 1);
  });

  it("keeps only one active plan after renew and after duplicate cleanup", async () => {
    await cleanup();
    const firstPay = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "subscription",
      amountEtb: plan3.priceEtb,
      title: "Lisan",
      description: plan3.name,
      planId: plan3.id,
    });
    await completeMockPayment(firstPay.txRef, "success");
    const current = await prisma.subscription.findFirst({
      where: { organizationId: org.id, status: "active" },
    });
    assert.ok(current);

    const pending = await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan3.id,
        createdById: hospitalUser.id,
        status: "pending",
      },
    });
    const renewPay = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "subscription",
      amountEtb: plan3.priceEtb,
      title: "Lisan",
      description: plan3.name,
      planId: plan3.id,
      subscriptionId: pending.id,
      metadata: { action: "renew" },
    });
    await completeMockPayment(renewPay.txRef, "success");
    assert.equal(
      await prisma.subscription.count({ where: { organizationId: org.id, status: "active" } }),
      1
    );

    // Simulate a corrupted state with two actives, then clean it up.
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan5.id,
        createdById: hospitalUser.id,
        status: "active",
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        autoRenew: true,
      },
    });
    assert.equal(
      await prisma.subscription.count({ where: { organizationId: org.id, status: "active" } }),
      2
    );
    await ensureSingleActiveSubscription(org.id);
    assert.equal(
      await prisma.subscription.count({ where: { organizationId: org.id, status: "active" } }),
      1
    );
  });

  it("does not add minutes when Chapa payment fails", async () => {
    await cleanup();
    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "minute_package",
      amountEtb: pkg.priceEtb,
      title: "Lisan",
      description: pkg.name,
      packageId: pkg.id,
    });
    const failed = await completeMockPayment(payment.txRef, "failed");
    assert.equal(failed.payment.status, "failed");
    assert.equal(await remainingMinutes(org.id), 0);
  });

  it("credits minutes only after a successful package payment", async () => {
    await cleanup();
    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "minute_package",
      amountEtb: pkg.priceEtb,
      title: "Lisan",
      description: pkg.name,
      packageId: pkg.id,
    });
    await completeMockPayment(payment.txRef, "success");
    assert.equal(await remainingMinutes(org.id), 1000);
    await completeMockPayment(payment.txRef, "success");
    assert.equal(await remainingMinutes(org.id), 1000);
  });
});

describe("hospital access and devices", () => {
  it("blocks live consults when on-demand is disabled and there is no plan or minutes", async () => {
    await cleanup();
    await updatePlatformBillingConfig({ rateEtb: 400, rateUnit: "hour", enabled: false });
    await assert.rejects(
      () => assertHospitalCanStartConsult({ organizationId: org.id, fingerprint: "desk-1" }),
      (err) => err.status === 402 && err.code === "BILLING_REQUIRED"
    );
  });

  it("allows on-demand when there is no plan or minutes", async () => {
    await cleanup();
    const access = await assertHospitalCanStartConsult({ organizationId: org.id, fingerprint: "desk-od" });
    assert.equal(access.via, "ondemand");
  });

  it("enforces the monthly device cap and expired subscriptions", async () => {
    await cleanup();
    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "subscription",
      amountEtb: plan3.priceEtb,
      planId: plan3.id,
    });
    await completeMockPayment(payment.txRef, "success");
    await registerOrTouchDevice({ organizationId: org.id, fingerprint: "d1", enforceLimit: true, maxDevices: 3 });
    await registerOrTouchDevice({ organizationId: org.id, fingerprint: "d2", enforceLimit: true, maxDevices: 3 });
    await registerOrTouchDevice({ organizationId: org.id, fingerprint: "d3", enforceLimit: true, maxDevices: 3 });
    await assert.rejects(
      () => registerOrTouchDevice({ organizationId: org.id, fingerprint: "d4", enforceLimit: true, maxDevices: 3 }),
      (err) => err.status === 403
    );

    const first = await registerOrTouchDevice({
      organizationId: org.id,
      fingerprint: "d1",
      enforceLimit: true,
      maxDevices: 3,
    });
    await deactivateDevice(org.id, first.device.id);
    await registerOrTouchDevice({ organizationId: org.id, fingerprint: "d4", enforceLimit: true, maxDevices: 3 });
    await assert.rejects(
      () => registerOrTouchDevice({ organizationId: org.id, fingerprint: "d1", enforceLimit: true, maxDevices: 3 }),
      (err) => err.status === 403 && err.code === "DEVICE_LIMIT"
    );
    await assert.rejects(
      () => assertHospitalCanStartConsult({ organizationId: org.id }),
      (err) => err.status === 400 && err.code === "DEVICE_REQUIRED"
    );

    await prisma.subscription.updateMany({
      where: { organizationId: org.id, status: "active" },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });
    await expireDueSubscriptions();
    await updatePlatformBillingConfig({ rateEtb: 400, rateUnit: "hour", enabled: false });
    await assert.rejects(
      () => assertHospitalCanStartConsult({ organizationId: org.id, fingerprint: "d1" }),
      (err) => err.status === 402
    );
  });

  it("allows a consult when minutes remain and deducts once per session", async () => {
    await cleanup();
    await creditMinutes({ organizationId: org.id, minutes: 10, note: "test" });
    const access = await assertHospitalCanStartConsult({ organizationId: org.id, fingerprint: "desk-min" });
    assert.equal(access.via, "minutes");
    const sessionId = `session-test-${Date.now()}`;
    await prisma.session.create({
      data: {
        id: sessionId,
        doctorId: hospitalUser.id,
        organizationId: org.id,
        status: "completed",
        durationSeconds: 180,
      },
    });
    await debitMinutes({ organizationId: org.id, minutes: 3, sessionId, note: "usage" });
    await debitMinutes({ organizationId: org.id, minutes: 3, sessionId, note: "usage" });
    assert.equal(await remainingMinutes(org.id), 7);
  });
});

describe("post-paid on-demand usage", () => {
  it("records session usage on the monthly invoice and blocks when unpaid", async () => {
    await cleanup();
    await updatePlatformBillingConfig({ rateEtb: 400, rateUnit: "hour", enabled: true });
    const sessionId = `od-session-${Date.now()}`;
    await prisma.session.create({
      data: {
        id: sessionId,
        doctorId: hospitalUser.id,
        organizationId: org.id,
        status: "completed",
        billingMode: "ondemand",
        durationSeconds: 3600,
      },
    });
    const invoice = await recordSessionUsage({
      organizationId: org.id,
      sessionId,
      durationSeconds: 3600,
    });
    assert.equal(invoice.status, "open");
    assert.equal(Number(invoice.totalMinutes), 60);
    assert.equal(Number(invoice.totalEtb), 400);

    await prisma.usageInvoice.update({
      where: { id: invoice.id },
      data: {
        periodEnd: new Date(Date.now() - 60 * 1000),
        periodStart: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      },
    });
    await closeDueInvoices({ organizationId: org.id });
    const issued = await prisma.usageInvoice.findUnique({ where: { id: invoice.id } });
    assert.equal(issued.status, "issued");

    await assert.rejects(
      () => assertHospitalCanStartConsult({ organizationId: org.id, fingerprint: "blocked" }),
      (err) => err.status === 402 && err.code === "UNPAID_INVOICE"
    );

    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "usage_invoice",
      amountEtb: issued.totalEtb,
      invoiceId: issued.id,
    });
    const paid = await completeMockPayment(payment.txRef, "success");
    assert.equal(paid.payment.status, "paid");
    const settled = await prisma.usageInvoice.findUnique({ where: { id: invoice.id } });
    assert.equal(settled.status, "paid");

    const access = await assertHospitalCanStartConsult({ organizationId: org.id, fingerprint: "unblocked" });
    assert.equal(access.via, "ondemand");
  });

  it("uses the open invoice for the current calendar month", async () => {
    await cleanup();
    const open = await getOrCreateOpenInvoice(org.id);
    const { periodKey } = monthPeriod();
    assert.equal(open.periodKey, periodKey);
    assert.equal(open.status, "open");
  });

  it("prices short per-hour sessions without 36-second rounding", async () => {
    assert.equal(usageAmountEtb(400, 20 / 60, "hour"), 2.22);
  });

  it("still records usage when on-demand was disabled after the consult started", async () => {
    await cleanup();
    await updatePlatformBillingConfig({ rateEtb: 400, rateUnit: "hour", enabled: true });
    const sessionId = `od-disabled-${Date.now()}`;
    await prisma.session.create({
      data: {
        id: sessionId,
        doctorId: hospitalUser.id,
        organizationId: org.id,
        status: "completed",
        billingMode: "ondemand",
        durationSeconds: 120,
      },
    });
    await updatePlatformBillingConfig({ enabled: false });
    const invoice = await recordSessionUsage({
      organizationId: org.id,
      sessionId,
      durationSeconds: 120,
    });
    assert.ok(invoice);
    assert.equal(Number(invoice.totalMinutes), 2);
    assert.equal(Number(invoice.totalEtb), usageAmountEtb(400, 2, "hour"));
  });

  it("refuses a second checkout while an invoice payment is pending", async () => {
    await cleanup();
    await updatePlatformBillingConfig({ rateEtb: 100, rateUnit: "hour", enabled: true });
    const sessionId = `od-dup-pay-${Date.now()}`;
    await prisma.session.create({
      data: {
        id: sessionId,
        doctorId: hospitalUser.id,
        organizationId: org.id,
        status: "completed",
        billingMode: "ondemand",
        durationSeconds: 3600,
      },
    });
    const open = await recordSessionUsage({
      organizationId: org.id,
      sessionId,
      durationSeconds: 3600,
    });
    await prisma.usageInvoice.update({
      where: { id: open.id },
      data: { status: "issued", periodEnd: new Date(Date.now() - 1000) },
    });
    await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "usage_invoice",
      amountEtb: open.totalEtb,
      invoiceId: open.id,
    });
    await assert.rejects(
      () => assertInvoiceCheckoutAllowed(open.id, org.id),
      (err) => err.status === 409 && err.code === "INVOICE_PAYMENT_PENDING"
    );
  });

  it("bills by the minute when admin sets rate unit to minute", async () => {
    await cleanup();
    await updatePlatformBillingConfig({ rateEtb: 10, rateUnit: "minute", enabled: true });
    const sessionId = `od-min-${Date.now()}`;
    await prisma.session.create({
      data: {
        id: sessionId,
        doctorId: hospitalUser.id,
        organizationId: org.id,
        status: "completed",
        billingMode: "ondemand",
        durationSeconds: 180,
      },
    });
    const invoice = await recordSessionUsage({
      organizationId: org.id,
      sessionId,
      durationSeconds: 180,
    });
    assert.equal(Number(invoice.totalMinutes), 3);
    assert.equal(Number(invoice.totalEtb), 30);
    assert.equal(invoice.rateUnit, "minute");
  });
});

describe("on-demand bookings", () => {
  it("confirms a booking after payment and rejects translator conflicts", async () => {
    await cleanup();
    const nextFriday = futureFriday();
    const { booking } = await createPendingBooking({
      organizationId: org.id,
      bookedById: hospitalUser.id,
      serviceId: service.id,
      languageId: language.id,
      translatorId: translator.id,
      date: nextFriday,
      startTime: "14:00",
      endTime: "17:00",
    });
    assert.equal(booking.status, "pending_payment");
    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "booking",
      amountEtb: booking.priceEtb,
      bookingId: booking.id,
    });
    const paid = await completeMockPayment(payment.txRef, "success");
    assert.equal(paid.payment.status, "paid");
    const confirmed = await prisma.booking.findUnique({ where: { id: booking.id } });
    assert.equal(confirmed.status, "confirmed");

    const conflicts = await findTranslatorConflicts(
      translator.id,
      confirmed.startsAt,
      confirmed.endsAt
    );
    assert.equal(hasBookingConflict(conflicts, confirmed.startsAt, confirmed.endsAt), true);
    await assert.rejects(
      () =>
        createPendingBooking({
          organizationId: org.id,
          bookedById: hospitalUser.id,
          serviceId: service.id,
          languageId: language.id,
          translatorId: translator.id,
          date: nextFriday,
          startTime: "15:00",
          endTime: "16:00",
        }),
      (err) => err.status === 409
    );
  });
});

describe("authorization", () => {
  it("does not let another hospital verify a payment", async () => {
    await cleanup();
    const otherOrg = await prisma.organization.create({ data: { name: `Other ${Date.now()}` } });
    const otherUser = {
      id: hospitalUser.id,
      organizationId: otherOrg.id,
      role: "hospital_admin",
    };
    const payment = await createPendingPayment({
      req,
      user: hospitalUser,
      organizationId: org.id,
      kind: "minute_package",
      amountEtb: pkg.priceEtb,
      packageId: pkg.id,
    });
    const { assertOwnPayment } = await import("./payments.service.js");
    assert.throws(() => assertOwnPayment(payment, otherUser), (err) => err.status === 403);
    await prisma.payment.delete({ where: { id: payment.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});

function futureFriday() {
  const now = new Date();
  const addis = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const day = addis.getUTCDay();
  const delta = ((5 - day + 7) % 7) || 7;
  addis.setUTCDate(addis.getUTCDate() + delta);
  const y = addis.getUTCFullYear();
  const m = String(addis.getUTCMonth() + 1).padStart(2, "0");
  const d = String(addis.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
