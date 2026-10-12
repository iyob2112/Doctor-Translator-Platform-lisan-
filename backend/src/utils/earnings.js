import { prisma } from "../config/db.js";
import {
  anchorDayFrom,
  currentOpenPeriod,
  isPeriodClosed,
  listCalendarMonths,
  periodFromInstant,
  periodFromKey,
  serializePeriod,
  zonedParts,
} from "./payPeriod.js";

export const BIRR_PER_HOUR = 100;
const RESERVED_STATUSES = ["pending", "approved", "paid"];

function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

async function translatorAnchorDay(translatorId) {
  const user = await prisma.user.findUnique({
    where: { id: translatorId },
    select: {
      createdAt: true,
      translatorProfile: { select: { createdAt: true } },
    },
  });
  const startedAt = user?.translatorProfile?.createdAt || user?.createdAt;
  return startedAt ? anchorDayFrom(startedAt) : 21;
}

export function serializeWithdrawal(row, fallbackDay = 21) {
  if (!row) return null;
  const built =
    periodFromKey(row.periodKey, fallbackDay) ||
    (row.periodStart && row.periodEnd
      ? {
          ...periodFromInstant(row.periodEnd, fallbackDay),
          start: new Date(row.periodStart),
          end: new Date(row.periodEnd),
        }
      : row.createdAt
        ? periodFromInstant(row.createdAt, fallbackDay)
        : null);
  const period = built ? serializePeriod(built) : null;
  return {
    id: row.id,
    translatorId: row.translatorId,
    amountEtb: money(row.amountEtb),
    method: row.method,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    note: row.note || null,
    periodKey: row.periodKey || period?.key || null,
    period,
    status: row.status,
    reviewNote: row.reviewNote || null,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    translator: row.translator
      ? {
          id: row.translator.id,
          fullName: row.translator.fullName,
          email: row.translator.email,
        }
      : undefined,
  };
}

function sessionInstant(session) {
  return session.endedAt || session.startedAt || session.createdAt;
}

function secondsBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000));
}

export function secondsWorkedByTranslator(session, translatorId) {
  const transfers = [...(session.transfers || [])].sort(
    (a, b) => new Date(a.transferredAt) - new Date(b.transferredAt)
  );
  const start = session.startedAt || session.createdAt;
  const end = session.endedAt || start;
  if (!transfers.length) {
    if (session.translatorId !== translatorId) return 0;
    if (session.durationSeconds != null) return Math.max(0, session.durationSeconds);
    return secondsBetween(start, end);
  }

  let total = 0;
  let cursor = start;
  let holder = transfers[0].fromTranslatorId;
  for (const transfer of transfers) {
    if (holder === translatorId) total += secondsBetween(cursor, transfer.transferredAt);
    holder = transfer.toTranslatorId;
    cursor = transfer.transferredAt;
  }
  if (holder === translatorId) total += secondsBetween(cursor, end);
  return total;
}

export async function getTranslatorPaySummary(translatorId, now = new Date()) {
  const [rawSessions, withdrawals, anchorDay] = await Promise.all([
    prisma.session.findMany({
      where: {
        status: "completed",
        OR: [
          { translatorId },
          { transfers: { some: { fromTranslatorId: translatorId } } },
          { transfers: { some: { toTranslatorId: translatorId } } },
        ],
      },
      select: {
        id: true,
        translatorId: true,
        durationSeconds: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        attendingName: true,
        providerRating: true,
        language: { select: { id: true, name: true, code: true } },
        doctor: { select: { id: true, fullName: true } },
        department: { select: { name: true } },
        organization: { select: { name: true } },
        transfers: {
          select: { fromTranslatorId: true, toTranslatorId: true, transferredAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.withdrawalRequest.findMany({
      where: { translatorId },
      orderBy: { createdAt: "desc" },
    }),
    translatorAnchorDay(translatorId),
  ]);

  const sessions = rawSessions.map((session) => ({
    ...session,
    durationSeconds: secondsWorkedByTranslator(session, translatorId),
  }));

  const byPeriod = new Map();
  for (const session of sessions) {
    const period = periodFromInstant(sessionInstant(session), anchorDay);
    const current = byPeriod.get(period.key) || {
      period,
      totalSeconds: 0,
      sessions: [],
    };
    current.totalSeconds += session.durationSeconds || 0;
    current.sessions.push(session);
    byPeriod.set(period.key, current);
  }

  const withdrawalsByPeriod = new Map();
  for (const row of withdrawals) {
    const key = row.periodKey || periodFromInstant(row.createdAt, anchorDay).key;
    const list = withdrawalsByPeriod.get(key) || [];
    list.push(row);
    withdrawalsByPeriod.set(key, list);
  }

  const periodKeys = new Set([...byPeriod.keys(), ...withdrawalsByPeriod.keys()]);
  const periods = [...periodKeys]
    .sort()
    .reverse()
    .map((key) => {
      const bucket = byPeriod.get(key);
      const period = bucket?.period || periodFromKey(key, anchorDay) || periodFromInstant(now, anchorDay);
      const hoursWorked = (bucket?.totalSeconds || 0) / 3600;
      const earningsEtb = money(hoursWorked * BIRR_PER_HOUR);
      const rows = withdrawalsByPeriod.get(key) || [];
      const reservedEtb = money(
        rows
          .filter((row) => RESERVED_STATUSES.includes(row.status))
          .reduce((sum, row) => sum + Number(row.amountEtb), 0)
      );
      const availableEtb = money(Math.max(0, earningsEtb - reservedEtb));
      const active = rows.find((row) => row.status === "pending" || row.status === "approved") || null;
      const paid = rows.find((row) => row.status === "paid") || null;
      return {
        ...serializePeriod(period),
        hoursWorked: Number(hoursWorked.toFixed(4)),
        totalSeconds: bucket?.totalSeconds || 0,
        earningsEtb,
        reservedEtb,
        availableEtb,
        request: serializeWithdrawal(active || paid || rows[0] || null, anchorDay),
      };
    });

  const open = currentOpenPeriod(now, anchorDay);
  const openRow = periods.find((row) => row.key === open.key) || {
    ...serializePeriod(open),
    hoursWorked: 0,
    totalSeconds: 0,
    earningsEtb: 0,
    reservedEtb: 0,
    availableEtb: 0,
    request: null,
  };

  const duePayout =
    periods.find(
      (row) =>
        isPeriodClosed({ end: new Date(row.end) }, now) &&
        row.availableEtb > 0 &&
        row.request?.status !== "pending" &&
        row.request?.status !== "approved"
    ) || null;

  const totalSeconds = sessions.reduce((sum, session) => sum + (session.durationSeconds || 0), 0);
  const hoursWorked = totalSeconds / 3600;
  const earningsEtb = money(hoursWorked * BIRR_PER_HOUR);
  const reservedEtb = money(
    withdrawals
      .filter((row) => RESERVED_STATUSES.includes(row.status))
      .reduce((sum, row) => sum + Number(row.amountEtb), 0)
  );
  const pending = withdrawals.find((row) => row.status === "pending") || null;
  const reviewing = withdrawals.find((row) => row.status === "pending" || row.status === "approved") || null;

  return {
    rate: { amount: BIRR_PER_HOUR, currency: "ETB", unit: "hour" },
    payoutDay: anchorDay,
    stats: {
      completedSessions: sessions.length,
      totalSeconds,
      hoursWorked: Number(hoursWorked.toFixed(4)),
      earningsEtb,
      reservedEtb,
      availableEtb: money(Math.max(0, earningsEtb - reservedEtb)),
      currentPeriodEtb: openRow.earningsEtb,
      dueEtb: duePayout?.availableEtb || 0,
    },
    currentPeriod: openRow,
    duePayout: duePayout
      ? {
          period: duePayout,
          amountEtb: duePayout.availableEtb,
          hoursWorked: duePayout.hoursWorked,
        }
      : null,
    reviewingWithdrawal: serializeWithdrawal(reviewing, anchorDay),
    periods,
    sessions,
    withdrawals: withdrawals.map((row) => serializeWithdrawal(row, anchorDay)),
    pendingWithdrawal: serializeWithdrawal(pending, anchorDay),
  };
}

function monthKeyOf(row) {
  if (row.periodKey && /^\d{4}-\d{2}/.test(row.periodKey)) return row.periodKey.slice(0, 7);
  if (row.period?.payoutDate) {
    const parts = zonedParts(new Date(row.period.payoutDate));
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  }
  if (row.createdAt) {
    const parts = zonedParts(new Date(row.createdAt));
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  }
  return null;
}

export function groupWithdrawalsByMonth(withdrawals, now = new Date()) {
  const serialized = withdrawals.map((row) => serializeWithdrawal(row));
  const months = listCalendarMonths(8, now).map((month) => ({
    ...month,
    windowLabel: "Each interpreter is paid on the day they started",
    withdrawals: serialized.filter((row) => monthKeyOf(row) === month.key),
  }));
  const known = new Set(months.map((month) => month.key));
  const leftover = serialized.filter((row) => {
    const key = monthKeyOf(row);
    return !key || !known.has(key);
  });
  if (leftover.length) {
    months.push({
      key: "earlier",
      label: "Earlier",
      windowLabel: "Before the current months",
      withdrawals: leftover,
    });
  }
  return { withdrawals: serialized, months };
}
