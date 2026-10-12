import { prisma } from "../config/db.js";
import { etb, money } from "../utils/money.js";
import {
  httpError,
  usageAmountEtb,
  usageMinutesFromSession,
} from "../utils/billing.js";

const CONFIG_ID = "default";
const DEFAULT_RATE_ETB = 400;
const DEFAULT_RATE_UNIT = "hour";
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Addis_Ababa (UTC+3, no DST)

export function monthPeriod(at = new Date()) {
  const local = new Date(at.getTime() + TZ_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodStart = new Date(Date.UTC(year, month - 1, 1) - TZ_OFFSET_MS);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const periodEnd = new Date(Date.UTC(nextYear, nextMonth - 1, 1) - TZ_OFFSET_MS);
  return { periodKey, periodStart, periodEnd };
}

const MAX_RATE_ETB = 9999999999.99;

function normalizeRateUnit(unit) {
  return unit === "minute" ? "minute" : "hour";
}

function parseRateUnit(unit) {
  if (unit === undefined || unit === null) return undefined;
  const u = String(unit).trim().toLowerCase();
  if (u === "hour" || u === "minute") return u;
  throw httpError(400, "rateUnit must be hour or minute");
}

export async function getPlatformBillingConfig(db = prisma) {
  let config = await db.platformBillingConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!config) {
    config = await db.platformBillingConfig.create({
      data: {
        id: CONFIG_ID,
        rateEtb: etb(DEFAULT_RATE_ETB),
        rateUnit: DEFAULT_RATE_UNIT,
        enabled: true,
      },
    });
  }
  return config;
}

export async function updatePlatformBillingConfig({ rateEtb, rateUnit, hourlyRateEtb, enabled }, db = prisma) {
  const rawRate = rateEtb ?? hourlyRateEtb;
  const hasRateField = rawRate !== undefined && rawRate !== null;
  const hasUnitField = rateUnit !== undefined && rateUnit !== null;
  const hasEnabledField = typeof enabled === "boolean";
  if (!hasRateField && !hasUnitField && !hasEnabledField) {
    throw httpError(400, "Nothing to update");
  }

  await getPlatformBillingConfig(db);
  const data = {};
  if (hasRateField) {
    if (rawRate === "") throw httpError(400, "Rate is required");
    const amount = Number(rawRate);
    if (!Number.isFinite(amount) || amount < 0) {
      throw httpError(400, "Rate must be a non-negative ETB amount");
    }
    if (amount > MAX_RATE_ETB) throw httpError(400, "Rate is too large");
    data.rateEtb = etb(amount);
  }
  if (hasUnitField) {
    data.rateUnit = parseRateUnit(rateUnit);
  }
  if (hasEnabledField) {
    data.enabled = enabled;
  }

  const updated = await db.platformBillingConfig.update({
    where: { id: CONFIG_ID },
    data,
  });

  if (data.rateEtb !== undefined || data.rateUnit !== undefined) {
    await db.usageInvoice.updateMany({
      where: { status: "open" },
      data: {
        ...(data.rateEtb !== undefined ? { rateEtb: data.rateEtb } : {}),
        ...(data.rateUnit !== undefined ? { rateUnit: data.rateUnit } : {}),
      },
    });
  }

  return updated;
}

export function presentPlatformConfig(config) {
  if (!config) return null;
  const rateUnit = normalizeRateUnit(config.rateUnit);
  const rateEtb = etb(config.rateEtb ?? config.hourlyRateEtb);
  const hourlyRateEtb = rateUnit === "minute" ? etb(rateEtb * 60) : rateEtb;
  const minuteRateEtb = rateUnit === "minute" ? rateEtb : etb(rateEtb / 60);
  return {
    rateEtb,
    rateUnit,
    hourlyRateEtb,
    minuteRateEtb,
    enabled: Boolean(config.enabled),
    updatedAt: config.updatedAt,
  };
}

export function invoiceInclude() {
  return {
    lines: {
      orderBy: { createdAt: "desc" },
      include: {
        session: {
          select: {
            id: true,
            callMode: true,
            startedAt: true,
            endedAt: true,
            createdAt: true,
          },
        },
      },
    },
    organization: { select: { id: true, name: true } },
    payments: {
      where: { status: { in: ["pending", "paid"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, txRef: true, amountEtb: true, createdAt: true },
    },
  };
}

export function presentInvoice(invoice) {
  if (!invoice) return null;
  const rateUnit = normalizeRateUnit(invoice.rateUnit);
  const rateEtb = etb(invoice.rateEtb ?? invoice.hourlyRateEtb);
  return {
    id: invoice.id,
    periodKey: invoice.periodKey,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    status: invoice.status,
    totalMinutes: money(invoice.totalMinutes),
    totalEtb: etb(invoice.totalEtb),
    rateEtb,
    rateUnit,
    hourlyRateEtb: rateUnit === "minute" ? etb(rateEtb * 60) : rateEtb,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    organization: invoice.organization
      ? { id: invoice.organization.id, name: invoice.organization.name }
      : undefined,
    lines: (invoice.lines || []).map((line) => {
      const lineUnit = normalizeRateUnit(line.rateUnit || rateUnit);
      const lineRate = etb(line.rateEtb ?? line.hourlyRateEtb);
      return {
        id: line.id,
        sessionId: line.sessionId,
        durationSeconds: line.durationSeconds,
        minutes: money(line.minutes),
        rateEtb: lineRate,
        rateUnit: lineUnit,
        hourlyRateEtb: lineUnit === "minute" ? etb(lineRate * 60) : lineRate,
        amountEtb: etb(line.amountEtb),
        createdAt: line.createdAt,
        session: line.session || null,
      };
    }),
    payments: (invoice.payments || []).map((p) => ({
      id: p.id,
      status: p.status,
      txRef: p.txRef,
      amountEtb: etb(p.amountEtb),
      createdAt: p.createdAt,
    })),
  };
}

async function recalculateInvoiceTotals(invoiceId, db) {
  const agg = await db.usageLine.aggregate({
    where: { invoiceId },
    _sum: { minutes: true, amountEtb: true },
  });
  return db.usageInvoice.update({
    where: { id: invoiceId },
    data: {
      totalMinutes: etb(agg._sum.minutes || 0),
      totalEtb: etb(agg._sum.amountEtb || 0),
    },
    include: invoiceInclude(),
  });
}

export async function closeDueInvoices({ organizationId, now = new Date() } = {}, db = prisma) {
  const where = {
    status: "open",
    periodEnd: { lte: now },
    ...(organizationId ? { organizationId } : {}),
  };
  const due = await db.usageInvoice.findMany({ where });
  for (const inv of due) {
    const total = money(inv.totalEtb);
    if (total <= 0) {
      await db.usageInvoice.update({
        where: { id: inv.id },
        data: { status: "void", issuedAt: now },
      });
    } else {
      await db.usageInvoice.update({
        where: { id: inv.id },
        data: { status: "issued", issuedAt: now },
      });
    }
  }
  return due.length;
}

export async function hasUnpaidInvoice(organizationId, db = prisma) {
  await closeDueInvoices({ organizationId }, db);
  const unpaid = await db.usageInvoice.findFirst({
    where: { organizationId, status: "issued" },
    orderBy: { periodEnd: "asc" },
  });
  return unpaid;
}

export async function findCurrentInvoice(organizationId, db = prisma) {
  await closeDueInvoices({ organizationId }, db);
  const { periodKey } = monthPeriod();
  return db.usageInvoice.findUnique({
    where: { organizationId_periodKey: { organizationId, periodKey } },
    include: invoiceInclude(),
  });
}

export async function getOrCreateOpenInvoice(organizationId, db = prisma) {
  await closeDueInvoices({ organizationId }, db);
  const { periodKey, periodStart, periodEnd } = monthPeriod();
  const config = await getPlatformBillingConfig(db);
  const existing = await db.usageInvoice.findUnique({
    where: { organizationId_periodKey: { organizationId, periodKey } },
    include: invoiceInclude(),
  });
  if (existing) return existing;
  return db.usageInvoice.create({
    data: {
      organizationId,
      periodKey,
      periodStart,
      periodEnd,
      status: "open",
      rateEtb: config.rateEtb,
      rateUnit: normalizeRateUnit(config.rateUnit),
    },
    include: invoiceInclude(),
  });
}

export async function recordSessionUsage({
  organizationId,
  sessionId,
  durationSeconds,
}, db = prisma) {
  const existingLine = await db.usageLine.findUnique({ where: { sessionId } });
  if (existingLine) {
    return db.usageInvoice.findUnique({
      where: { id: existingLine.invoiceId },
      include: invoiceInclude(),
    });
  }

  const config = await getPlatformBillingConfig(db);

  const minutes = usageMinutesFromSession(durationSeconds);
  if (minutes <= 0) return null;

  const rateUnit = normalizeRateUnit(config.rateUnit);
  const rate = etb(config.rateEtb);
  const amountEtb = usageAmountEtb(rate, minutes, rateUnit);
  const invoice = await getOrCreateOpenInvoice(organizationId, db);
  if (invoice.status !== "open") {
    throw httpError(409, "Current month invoice is closed", { code: "INVOICE_CLOSED" });
  }

  await db.usageLine.create({
    data: {
      invoiceId: invoice.id,
      sessionId,
      durationSeconds: Math.max(0, Math.round(durationSeconds)),
      minutes: etb(minutes),
      rateEtb: etb(rate),
      rateUnit,
      amountEtb: etb(amountEtb),
    },
  });

  return recalculateInvoiceTotals(invoice.id, db);
}

/** Remove empty draft bills (0 usage) so admin/hospital don't see meaningless "open" rows. */
export async function purgeEmptyOpenInvoices({ organizationId } = {}, db = prisma) {
  return db.usageInvoice.updateMany({
    where: {
      status: "open",
      totalMinutes: 0,
      totalEtb: 0,
      ...(organizationId ? { organizationId } : {}),
    },
    data: { status: "void", issuedAt: new Date() },
  });
}

export async function listInvoices({ organizationId, status } = {}, take = 50, db = prisma) {
  if (organizationId) await closeDueInvoices({ organizationId }, db);
  else await closeDueInvoices({}, db);
  await purgeEmptyOpenInvoices({ organizationId }, db);
  const where = {
    ...(organizationId ? { organizationId } : {}),
  };
  if (status) {
    where.status = status;
  } else {
    where.status = { not: "void" };
    where.NOT = { status: "open", totalMinutes: 0, totalEtb: 0 };
  }
  return db.usageInvoice.findMany({
    where,
    include: invoiceInclude(),
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    take,
  });
}

export async function getInvoiceForOrg(invoiceId, organizationId, db = prisma) {
  const invoice = await db.usageInvoice.findUnique({
    where: { id: invoiceId },
    include: invoiceInclude(),
  });
  if (!invoice || (organizationId && invoice.organizationId !== organizationId)) {
    throw httpError(404, "Invoice not found");
  }
  return invoice;
}

export async function assertInvoiceCheckoutAllowed(invoiceId, organizationId, db = prisma) {
  const invoice = await getInvoiceForOrg(invoiceId, organizationId, db);
  if (invoice.status === "paid") {
    throw httpError(400, "Invoice is already paid", { code: "INVOICE_ALREADY_PAID" });
  }
  if (invoice.status !== "issued") {
    throw httpError(400, "Only issued monthly bills can be paid");
  }
  const paidPayment = await db.payment.findFirst({
    where: { invoiceId: invoice.id, kind: "usage_invoice", status: "paid" },
  });
  if (paidPayment) {
    throw httpError(400, "Invoice is already paid", { code: "INVOICE_ALREADY_PAID" });
  }
  const pendingPayment = await db.payment.findFirst({
    where: { invoiceId: invoice.id, kind: "usage_invoice", status: "pending" },
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { id: true, name: true } },
      user: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (pendingPayment) {
    throw httpError(409, "A payment for this invoice is already pending", {
      code: "INVOICE_PAYMENT_PENDING",
      payment: pendingPayment,
    });
  }
  return invoice;
}

export async function markInvoicePaid(invoiceId, db = prisma) {
  const invoice = await db.usageInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw httpError(404, "Invoice not found");
  if (invoice.status === "paid") {
    throw httpError(409, "Invoice is already paid", { code: "INVOICE_ALREADY_PAID" });
  }
  if (invoice.status !== "issued") {
    throw httpError(400, "Only issued invoices can be paid");
  }
  return db.usageInvoice.update({
    where: { id: invoiceId },
    data: { status: "paid", paidAt: new Date() },
    include: invoiceInclude(),
  });
}

export async function assertCanUseOndemand(organizationId, db = prisma) {
  const unpaid = await hasUnpaidInvoice(organizationId, db);
  if (unpaid) {
    throw httpError(
      402,
      `This hospital has an unpaid on-demand bill for ${unpaid.periodKey}. Pay it before starting more consults.`,
      { code: "UNPAID_INVOICE", invoiceId: unpaid.id, periodKey: unpaid.periodKey }
    );
  }
  const config = await getPlatformBillingConfig(db);
  if (!config.enabled) {
    throw httpError(
      402,
      "This hospital needs an active monthly plan or remaining minutes before starting a consult.",
      { code: "BILLING_REQUIRED" }
    );
  }
  return config;
}
