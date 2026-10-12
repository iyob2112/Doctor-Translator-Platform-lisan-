import { etb, hoursFromMinutes, minutesFromSeconds, money } from "./money.js";

export const ADDIS_OFFSET_HOURS = 3;
export const MIN_BOOKING_MINUTES = 30;

export function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

export function addisParts(date = new Date()) {
  const shifted = new Date(date.getTime() + ADDIS_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function addisDate(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - ADDIS_OFFSET_HOURS, minute, 0));
}

export function parseClock(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatClock(minuteOfDay) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function weekdayName(weekday) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday] || "";
}

export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function isSubscriptionActive(sub, now = new Date()) {
  if (!sub || sub.status !== "active") return false;
  if (sub.expiresAt && new Date(sub.expiresAt) <= now) return false;
  return true;
}

export function nextPeriod(from = new Date(), intervalDays = 30) {
  const startsAt = new Date(from);
  const expiresAt = new Date(startsAt.getTime() + Number(intervalDays || 30) * 24 * 60 * 60 * 1000);
  return { startsAt, expiresAt };
}

export function renewPeriod(currentExpiresAt, intervalDays = 30, now = new Date()) {
  const base = currentExpiresAt && new Date(currentExpiresAt) > now ? new Date(currentExpiresAt) : now;
  return nextPeriod(base, intervalDays);
}

export function bookingPriceEtb(pricePerHourEtb, durationMinutes) {
  const minutes = Number(durationMinutes || 0);
  const rate = Number(pricePerHourEtb || 0);
  return etb((rate * minutes) / 60);
}

/** Price on-demand usage from rate + unit (hour | minute). Round only the final ETB amount. */
export function usageAmountEtb(rateEtb, durationMinutes, rateUnit = "hour") {
  const minutes = Number(durationMinutes || 0);
  const rate = Number(rateEtb || 0);
  if (rateUnit === "minute") return etb(rate * minutes);
  return etb((rate * minutes) / 60);
}

export function usageMinutesFromSession(durationSeconds) {
  return money(Math.ceil(minutesFromSeconds(durationSeconds) * 100) / 100);
}

export function slotCovers(slot, weekday, startMinute, endMinute) {
  return (
    slot.isActive !== false &&
    Number(slot.weekday) === Number(weekday) &&
    startMinute >= Number(slot.startMinute) &&
    endMinute <= Number(slot.endMinute)
  );
}

export function deviceLimitReached(activeCount, maxDevices, alreadyRegistered) {
  if (alreadyRegistered) return false;
  return Number(activeCount) >= Number(maxDevices);
}

export function serializePlan(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description || "",
    priceEtb: etb(plan.priceEtb),
    maxDevices: plan.maxDevices,
    intervalDays: plan.intervalDays,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

export function serializePackage(pkg) {
  if (!pkg) return null;
  return {
    id: pkg.id,
    slug: pkg.slug,
    name: pkg.name,
    minutes: pkg.minutes,
    priceEtb: etb(pkg.priceEtb),
    expiresInDays: pkg.expiresInDays,
    isActive: pkg.isActive,
    sortOrder: pkg.sortOrder,
  };
}

export function serializeBookingService(service) {
  if (!service) return null;
  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    description: service.description || "",
    callMode: service.callMode,
    pricePerHourEtb: etb(service.pricePerHourEtb),
    isActive: service.isActive,
    sortOrder: service.sortOrder,
  };
}

export function serializeSlot(slot) {
  if (!slot) return null;
  return {
    id: slot.id,
    weekday: slot.weekday,
    weekdayLabel: weekdayName(slot.weekday),
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    startTime: formatClock(slot.startMinute),
    endTime: formatClock(slot.endMinute),
    isActive: slot.isActive,
  };
}

export function serializeSubscription(sub) {
  if (!sub) return null;
  return {
    id: sub.id,
    status: sub.status,
    startsAt: sub.startsAt,
    expiresAt: sub.expiresAt,
    autoRenew: sub.autoRenew,
    cancelledAt: sub.cancelledAt,
    plan: serializePlan(sub.plan),
    organization: sub.organization
      ? { id: sub.organization.id, name: sub.organization.name }
      : undefined,
  };
}

export function serializeDevice(device) {
  if (!device) return null;
  return {
    id: device.id,
    fingerprint: device.fingerprint,
    label: device.label || "Hospital device",
    userAgent: device.userAgent,
    lastSeenAt: device.lastSeenAt,
    isActive: device.isActive,
    createdAt: device.createdAt,
  };
}

export function serializePayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    kind: payment.kind,
    status: payment.status,
    amountEtb: etb(payment.amountEtb),
    currency: payment.currency || "ETB",
    txRef: payment.txRef,
    chapaRef: payment.chapaRef,
    checkoutUrl: payment.checkoutUrl,
    verifiedAt: payment.verifiedAt,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
    plan: serializePlan(payment.plan),
    package: serializePackage(payment.package),
    booking: payment.booking
      ? {
          id: payment.booking.id,
          startsAt: payment.booking.startsAt,
          endsAt: payment.booking.endsAt,
          status: payment.booking.status,
        }
      : null,
    invoice: payment.invoice
      ? {
          id: payment.invoice.id,
          periodKey: payment.invoice.periodKey,
          status: payment.invoice.status,
          totalEtb: etb(payment.invoice.totalEtb),
        }
      : null,
    organization: payment.organization
      ? { id: payment.organization.id, name: payment.organization.name }
      : undefined,
  };
}

export function serializeBooking(booking) {
  if (!booking) return null;
  return {
    id: booking.id,
    status: booking.status,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    durationMinutes: booking.durationMinutes,
    priceEtb: etb(booking.priceEtb),
    notes: booking.notes || "",
    service: serializeBookingService(booking.service),
    language: booking.language
      ? { id: booking.language.id, code: booking.language.code, name: booking.language.name }
      : null,
    translator: booking.translator
      ? { id: booking.translator.id, fullName: booking.translator.fullName }
      : null,
    organization: booking.organization
      ? { id: booking.organization.id, name: booking.organization.name }
      : undefined,
    createdAt: booking.createdAt,
  };
}

export function serializeMinuteTxn(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    minutes: money(row.minutes),
    balanceAfter: money(row.balanceAfter),
    note: row.note || "",
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    package: serializePackage(row.package),
    sessionId: row.sessionId,
  };
}
