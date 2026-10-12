import { prisma } from "../config/db.js";
import {
  addisDate,
  addisParts,
  bookingPriceEtb,
  formatClock,
  httpError,
  MIN_BOOKING_MINUTES,
  parseClock,
  rangesOverlap,
  serializeBooking,
  slotCovers,
} from "../utils/billing.js";

const HOLD_STATUSES = ["pending_payment", "confirmed"];

export function quoteBookingWindow({ date, startTime, endTime }) {
  const day = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw httpError(400, "Choose a valid date");
  }
  const startMinute = parseClock(startTime);
  const endMinute = parseClock(endTime);
  if (startMinute == null || endMinute == null) {
    throw httpError(400, "Start and end time must be HH:MM");
  }
  if (endMinute <= startMinute) {
    throw httpError(400, "End time must be after start time");
  }
  const durationMinutes = endMinute - startMinute;
  if (durationMinutes < MIN_BOOKING_MINUTES) {
    throw httpError(400, `Bookings must be at least ${MIN_BOOKING_MINUTES} minutes`);
  }
  const [year, month, dayNum] = day.split("-").map(Number);
  const startsAt = addisDate(year, month, dayNum, Math.floor(startMinute / 60), startMinute % 60);
  const endsAt = addisDate(year, month, dayNum, Math.floor(endMinute / 60), endMinute % 60);
  if (startsAt <= new Date()) {
    throw httpError(400, "Choose a future date and time");
  }
  return {
    date: day,
    startTime: formatClock(startMinute),
    endTime: formatClock(endMinute),
    startMinute,
    endMinute,
    weekday: addisParts(startsAt).weekday,
    durationMinutes,
    startsAt,
    endsAt,
  };
}

export function assertSlotAvailable(slots, weekday, startMinute, endMinute) {
  const active = (slots || []).filter((slot) => slot.isActive !== false);
  if (!active.length) {
    throw httpError(400, "No booking time slots are configured");
  }
  const ok = active.some((slot) => slotCovers(slot, weekday, startMinute, endMinute));
  if (!ok) {
    throw httpError(400, "That time is outside the available booking hours");
  }
}

export function hasBookingConflict(existing, startsAt, endsAt) {
  return (existing || []).some((row) =>
    rangesOverlap(new Date(row.startsAt), new Date(row.endsAt), startsAt, endsAt)
  );
}

export async function findTranslatorConflicts(translatorId, startsAt, endsAt, ignoreId) {
  if (!translatorId) return [];
  return prisma.booking.findMany({
    where: {
      translatorId,
      status: { in: HOLD_STATUSES },
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
}

export async function quoteOnDemandBooking({
  serviceId,
  languageId,
  translatorId,
  date,
  startTime,
  endTime,
}) {
  if (!serviceId) throw httpError(400, "Select a service");
  if (!languageId) throw httpError(400, "Select a language");
  const window = quoteBookingWindow({ date, startTime, endTime });
  const [service, language, slots] = await Promise.all([
    prisma.bookingService.findUnique({ where: { id: serviceId } }),
    prisma.language.findUnique({ where: { id: languageId } }),
    prisma.bookingSlot.findMany({ where: { isActive: true } }),
  ]);
  if (!service || !service.isActive) throw httpError(404, "Service not found");
  if (!language) throw httpError(404, "Language not found");
  assertSlotAvailable(slots, window.weekday, window.startMinute, window.endMinute);

  let translator = null;
  if (translatorId) {
    translator = await prisma.user.findUnique({
      where: { id: translatorId },
      select: { id: true, fullName: true, role: true, isActive: true },
    });
    if (!translator || translator.role !== "translator" || !translator.isActive) {
      throw httpError(400, "Translator is not available");
    }
    const conflicts = await findTranslatorConflicts(translatorId, window.startsAt, window.endsAt);
    if (hasBookingConflict(conflicts, window.startsAt, window.endsAt)) {
      throw httpError(409, "That translator is already booked for this time");
    }
  }

  const priceEtb = bookingPriceEtb(service.pricePerHourEtb, window.durationMinutes);
  return {
    ...window,
    priceEtb,
    service,
    language,
    translator,
  };
}

export async function createPendingBooking({
  organizationId,
  bookedById,
  serviceId,
  languageId,
  translatorId,
  date,
  startTime,
  endTime,
  notes,
}) {
  const quote = await quoteOnDemandBooking({
    serviceId,
    languageId,
    translatorId,
    date,
    startTime,
    endTime,
  });
  const booking = await prisma.booking.create({
    data: {
      organizationId,
      bookedById,
      translatorId: quote.translator?.id || null,
      languageId: quote.language.id,
      serviceId: quote.service.id,
      startsAt: quote.startsAt,
      endsAt: quote.endsAt,
      durationMinutes: quote.durationMinutes,
      priceEtb: quote.priceEtb,
      status: "pending_payment",
      notes: notes || null,
    },
    include: bookingInclude(),
  });
  return { booking, quote };
}

export function bookingInclude() {
  return {
    service: true,
    language: { select: { id: true, code: true, name: true } },
    translator: { select: { id: true, fullName: true } },
    organization: { select: { id: true, name: true } },
  };
}

export async function confirmPaidBooking(bookingId, db = prisma) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude(),
  });
  if (!booking) throw httpError(404, "Booking not found");
  if (booking.status === "confirmed") return booking;
  if (booking.translatorId) {
    const conflicts = await db.booking.findMany({
      where: {
        translatorId: booking.translatorId,
        id: { not: booking.id },
        status: { in: HOLD_STATUSES },
        startsAt: { lt: booking.endsAt },
        endsAt: { gt: booking.startsAt },
      },
    });
    if (hasBookingConflict(conflicts, booking.startsAt, booking.endsAt)) {
      throw httpError(409, "That translator is already booked for this time");
    }
  }
  return db.booking.update({
    where: { id: booking.id },
    data: { status: "confirmed" },
    include: bookingInclude(),
  });
}

export async function listBookings(where, take = 100) {
  return prisma.booking.findMany({
    where,
    include: bookingInclude(),
    orderBy: { startsAt: "desc" },
    take,
  });
}

export function presentBooking(booking) {
  return serializeBooking(booking);
}
