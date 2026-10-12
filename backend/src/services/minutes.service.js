import { prisma } from "../config/db.js";
import { httpError, serializeMinuteTxn } from "../utils/billing.js";
import { money } from "../utils/money.js";

export async function getOrCreateBalance(organizationId, db = prisma) {
  return db.minuteBalance.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, remainingMinutes: 0 },
  });
}

export async function remainingMinutes(organizationId, db = prisma) {
  const balance = await getOrCreateBalance(organizationId, db);
  return money(balance.remainingMinutes);
}

export async function creditMinutes({
  organizationId,
  minutes,
  kind = "purchase",
  packageId,
  paymentId,
  note,
  expiresAt,
  db = prisma,
}) {
  const amount = money(minutes);
  if (amount <= 0) throw httpError(400, "Minutes must be greater than zero");

  if (paymentId) {
    const existing = await db.minuteTransaction.findUnique({ where: { paymentId } });
    if (existing) {
      return { transaction: existing, remaining: money(existing.balanceAfter), alreadyProcessed: true };
    }
  }

  const current = await getOrCreateBalance(organizationId, db);
  const next = money(Number(current.remainingMinutes) + amount);
  const balance = await db.minuteBalance.update({
    where: { organizationId },
    data: { remainingMinutes: next },
  });
  const transaction = await db.minuteTransaction.create({
    data: {
      organizationId,
      packageId: packageId || null,
      paymentId: paymentId || null,
      kind,
      minutes: amount,
      balanceAfter: balance.remainingMinutes,
      note: note || null,
      expiresAt: expiresAt || null,
    },
  });
  return { transaction, remaining: money(balance.remainingMinutes), alreadyProcessed: false };
}

export async function debitMinutes({
  organizationId,
  minutes,
  sessionId,
  note,
  db = prisma,
}) {
  const amount = money(minutes);
  if (amount <= 0) {
    return { remaining: await remainingMinutes(organizationId, db), skipped: true };
  }

  if (sessionId) {
    const existing = await db.minuteTransaction.findUnique({ where: { sessionId } });
    if (existing) {
      return { transaction: existing, remaining: money(existing.balanceAfter), alreadyProcessed: true };
    }
  }

  const current = await getOrCreateBalance(organizationId, db);
  const available = money(current.remainingMinutes);
  if (available + 1e-9 < amount) {
    throw httpError(403, "Insufficient minutes. Buy a minute package or start a monthly plan.", {
      code: "INSUFFICIENT_MINUTES",
      remaining: available,
    });
  }
  const next = money(available - amount);
  const balance = await db.minuteBalance.update({
    where: { organizationId },
    data: { remainingMinutes: next },
  });
  const transaction = await db.minuteTransaction.create({
    data: {
      organizationId,
      sessionId: sessionId || null,
      kind: "usage",
      minutes: -amount,
      balanceAfter: balance.remainingMinutes,
      note: note || null,
    },
  });
  return { transaction, remaining: money(balance.remainingMinutes), alreadyProcessed: false };
}

export async function listMinuteHistory(organizationId) {
  const rows = await prisma.minuteTransaction.findMany({
    where: { organizationId },
    include: { package: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serializeMinuteTxn);
}
