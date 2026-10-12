import crypto from "node:crypto";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { clientUrlFromRequest } from "../utils/origins.js";
import { etb } from "../utils/money.js";
import { httpError, serializePayment } from "../utils/billing.js";
import { initializeChapaCheckout, setMockChapaResult, verifyChapaTransaction } from "./chapa.service.js";
import { activatePaidSubscription } from "./subscriptions.service.js";
import { creditMinutes } from "./minutes.service.js";
import { confirmPaidBooking } from "./bookings.service.js";
import { markInvoicePaid } from "./invoices.service.js";

export function newTxRef(kind) {
  return `rl_${kind}_${crypto.randomBytes(8).toString("hex")}`;
}

function splitName(fullName) {
  const parts = String(fullName || "Hospital Desk").trim().split(/\s+/);
  return { firstName: parts[0] || "Hospital", lastName: parts.slice(1).join(" ") || "Desk" };
}

export function checkoutReturnUrl(req, txRef) {
  const client = clientUrlFromRequest(req, env.clientUrl);
  return `${client}/hospital/plans?tx_ref=${encodeURIComponent(txRef)}`;
}

export function checkoutCallbackUrl(req) {
  const origin = `${req.protocol}://${req.get("host")}`;
  return `${origin}/api/v1/billing/chapa/webhook`;
}

export async function createPendingPayment({
  req,
  user,
  organizationId,
  kind,
  amountEtb,
  title,
  description,
  planId,
  subscriptionId,
  packageId,
  bookingId,
  invoiceId,
  metadata,
}) {
  if (!env.chapaMock && !env.chapaSecretKey) {
    const err = new Error("Chapa payments are not configured");
    err.status = 503;
    throw err;
  }
  const txRef = newTxRef(
    kind === "minute_package"
      ? "min"
      : kind === "booking"
        ? "bk"
        : kind === "usage_invoice"
          ? "inv"
          : "sub"
  );
  const names = splitName(user.fullName);
  const returnUrl = checkoutReturnUrl(req, txRef);
  const payment = await prisma.payment.create({
    data: {
      organizationId,
      userId: user.id,
      kind,
      status: "pending",
      amountEtb: etb(amountEtb),
      currency: "ETB",
      txRef,
      planId: planId || null,
      subscriptionId: subscriptionId || null,
      packageId: packageId || null,
      bookingId: bookingId || null,
      invoiceId: invoiceId || null,
      metadata: metadata || undefined,
    },
  });

  try {
    const { checkoutUrl } = await initializeChapaCheckout({
      amountEtb: payment.amountEtb,
      email: user.email,
      firstName: names.firstName,
      lastName: names.lastName,
      txRef,
      returnUrl,
      callbackUrl: checkoutCallbackUrl(req),
      title,
      description,
    });

    return prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutUrl },
      include: paymentInclude(),
    });
  } catch (err) {
    await prisma.payment.delete({ where: { id: payment.id } }).catch(() => {});
    throw err;
  }
}

export function paymentInclude() {
  return {
    plan: true,
    package: true,
    booking: true,
    invoice: true,
    subscription: { include: { plan: true } },
    organization: { select: { id: true, name: true } },
    user: { select: { id: true, fullName: true, email: true } },
  };
}

async function fulfillPaidPayment(payment, verification, db) {
  if (payment.kind === "subscription") {
    await activatePaidSubscription({ ...payment, plan: payment.plan }, db);
  } else if (payment.kind === "minute_package") {
    const pkg = payment.package || (payment.packageId
      ? await db.minutePackage.findUnique({ where: { id: payment.packageId } })
      : null);
    if (!pkg) throw httpError(400, "Minute package is missing");
    const expiresAt = pkg.expiresInDays
      ? new Date(Date.now() + pkg.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    await creditMinutes({
      organizationId: payment.organizationId,
      minutes: pkg.minutes,
      kind: "purchase",
      packageId: pkg.id,
      paymentId: payment.id,
      note: `Purchased ${pkg.name}`,
      expiresAt,
      db,
    });
  } else if (payment.kind === "booking") {
    if (!payment.bookingId) throw httpError(400, "Booking is missing");
    await confirmPaidBooking(payment.bookingId, db);
  } else if (payment.kind === "usage_invoice") {
    if (!payment.invoiceId) throw httpError(400, "Invoice is missing");
    await markInvoicePaid(payment.invoiceId, db);
  }
}

async function markFailedPayment(payment, verification) {
  const status = verification.status === "cancelled" ? "cancelled" : "failed";
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status,
      failureReason: verification.message || "Payment was not successful",
    },
    include: paymentInclude(),
  });
  if (payment.kind === "subscription" && payment.subscriptionId) {
    await prisma.subscription.updateMany({
      where: { id: payment.subscriptionId, status: "pending" },
      data: { status: "cancelled", cancelledAt: new Date(), autoRenew: false },
    });
  }
  if (payment.kind === "booking" && payment.bookingId) {
    await prisma.booking.updateMany({
      where: { id: payment.bookingId, status: "pending_payment" },
      data: { status: "cancelled" },
    });
  }
  return updated;
}

export async function verifyAndFulfillPayment(txRef) {
  if (!txRef) throw httpError(400, "Transaction reference is required");
  const payment = await prisma.payment.findUnique({
    where: { txRef },
    include: paymentInclude(),
  });
  if (!payment) throw httpError(404, "Payment not found");
  if (payment.status === "paid") {
    return { payment, alreadyProcessed: true };
  }
  if (payment.status === "cancelled") {
    return { payment, alreadyProcessed: true };
  }

  const verification = await verifyChapaTransaction(txRef);
  if (!verification.ok) {
    if (verification.status === "pending") {
      return { payment, alreadyProcessed: false, pending: true };
    }
    return { payment: await markFailedPayment(payment, verification), alreadyProcessed: false };
  }

  const result = await prisma.$transaction(async (db) => {
    const claimed = await db.payment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: {
        status: "paid",
        verifiedAt: new Date(),
        chapaRef: verification.reference || null,
        failureReason: null,
      },
    });
    if (claimed.count === 0) {
      const current = await db.payment.findUnique({
        where: { id: payment.id },
        include: paymentInclude(),
      });
      return { payment: current, alreadyProcessed: true };
    }
    await fulfillPaidPayment(payment, verification, db);
    const next = await db.payment.findUnique({
      where: { id: payment.id },
      include: paymentInclude(),
    });
    return { payment: next, alreadyProcessed: false };
  });
  return result;
}

export async function completeMockPayment(txRef, result = "success") {
  if (env.chapaSecretKey && !env.chapaMock) {
    throw httpError(403, "Mock payments are disabled");
  }
  const status = result === "success" ? "success" : result === "cancelled" ? "cancelled" : "failed";
  setMockChapaResult(txRef, status, status === "success" ? null : "Simulated failed payment");
  return verifyAndFulfillPayment(txRef);
}

export function presentPayment(payment) {
  return serializePayment(payment);
}

export async function listPayments(where, take = 100) {
  return prisma.payment.findMany({
    where,
    include: paymentInclude(),
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function assertOwnPayment(payment, user) {
  if (user.role === "admin" || user.role === "subadmin") return;
  if (!payment || payment.organizationId !== user.organizationId) {
    throw httpError(403, "You can only access your hospital payments");
  }
}
