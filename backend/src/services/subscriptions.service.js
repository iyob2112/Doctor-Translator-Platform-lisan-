import { prisma } from "../config/db.js";
import { httpError, isSubscriptionActive, nextPeriod, renewPeriod, serializeSubscription } from "../utils/billing.js";

export async function expireDueSubscriptions(now = new Date(), db = prisma) {
  await db.subscription.updateMany({
    where: { status: "active", expiresAt: { lte: now } },
    data: { status: "expired" },
  });
}

/**
 * A hospital may have only one active plan. Keep preferId (or the latest expiry), cancel the rest.
 */
export async function ensureSingleActiveSubscription(
  organizationId,
  preferId = null,
  now = new Date(),
  db = prisma
) {
  if (!organizationId) return null;
  await expireDueSubscriptions(now, db);
  const actives = await db.subscription.findMany({
    where: { organizationId, status: "active" },
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
  });
  if (!actives.length) return null;

  const keep =
    (preferId && actives.find((row) => row.id === preferId)) || actives[0];

  if (actives.length > 1) {
    await db.subscription.updateMany({
      where: {
        organizationId,
        status: "active",
        id: { not: keep.id },
      },
      data: { status: "cancelled", cancelledAt: now, autoRenew: false },
    });
  }
  return keep;
}

export async function getActiveSubscription(organizationId, now = new Date(), db = prisma) {
  const keep = await ensureSingleActiveSubscription(organizationId, null, now, db);
  if (!keep) return null;
  const sub = await db.subscription.findUnique({
    where: { id: keep.id },
    include: { plan: true, organization: { select: { id: true, name: true } } },
  });
  return isSubscriptionActive(sub, now) ? sub : null;
}

export async function listSubscriptions(organizationId) {
  await ensureSingleActiveSubscription(organizationId);
  return prisma.subscription.findMany({
    where: { organizationId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function activatePaidSubscription(payment, db = prisma, now = new Date()) {
  const plan = payment.plan || (payment.planId
    ? await db.plan.findUnique({ where: { id: payment.planId } })
    : null);
  if (!plan) throw httpError(400, "Subscription plan is missing");

  const current = await db.subscription.findFirst({
    where: { organizationId: payment.organizationId, status: "active" },
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
  });

  let subscription = payment.subscriptionId
    ? await db.subscription.findUnique({ where: { id: payment.subscriptionId } })
    : null;

  if (subscription && subscription.status !== "pending") {
    throw httpError(
      409,
      "This subscription checkout was replaced or cancelled. Start a new checkout.",
      { code: "SUBSCRIPTION_CHECKOUT_STALE" }
    );
  }

  const samePlanRenewal = current && current.planId === plan.id;
  const period = samePlanRenewal
    ? renewPeriod(current.expiresAt, plan.intervalDays, now)
    : nextPeriod(now, plan.intervalDays);

  if (subscription && samePlanRenewal && current && subscription.id !== current.id) {
    // Renew: extend the current active row; discard the pending checkout row.
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: "cancelled", cancelledAt: now, autoRenew: false },
    });
    subscription = await db.subscription.update({
      where: { id: current.id },
      data: {
        status: "active",
        expiresAt: period.expiresAt,
        autoRenew: true,
        cancelledAt: null,
      },
      include: { plan: true },
    });
  } else if (subscription) {
    // New plan or first subscribe: activate the pending row.
    subscription = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        status: "active",
        startsAt: samePlanRenewal && current ? current.startsAt || period.startsAt : period.startsAt,
        expiresAt: period.expiresAt,
        autoRenew: true,
        cancelledAt: null,
      },
      include: { plan: true },
    });
  } else if (samePlanRenewal) {
    subscription = await db.subscription.update({
      where: { id: current.id },
      data: {
        status: "active",
        expiresAt: period.expiresAt,
        autoRenew: true,
        cancelledAt: null,
      },
      include: { plan: true },
    });
  } else {
    subscription = await db.subscription.create({
      data: {
        organizationId: payment.organizationId,
        planId: plan.id,
        createdById: payment.userId,
        status: "active",
        startsAt: period.startsAt,
        expiresAt: period.expiresAt,
        autoRenew: true,
      },
      include: { plan: true },
    });
  }

  await ensureSingleActiveSubscription(payment.organizationId, subscription.id, now, db);

  if (payment.id) {
    await db.payment.update({
      where: { id: payment.id },
      data: { subscriptionId: subscription.id, planId: plan.id },
    });
  }

  return db.subscription.findUnique({
    where: { id: subscription.id },
    include: { plan: true },
  });
}

export async function setAutoRenew(organizationId, autoRenew) {
  const current = await getActiveSubscription(organizationId);
  if (!current) throw httpError(404, "No active subscription");
  return prisma.subscription.update({
    where: { id: current.id },
    data: {
      autoRenew: Boolean(autoRenew),
      ...(autoRenew ? { cancelledAt: null } : { cancelledAt: new Date() }),
    },
    include: { plan: true },
  });
}

export function presentSubscription(sub) {
  return serializeSubscription(sub);
}
