const TZ = "Africa/Addis_Ababa";
const ADDIS_OFFSET_HOURS = 3;

export function zonedParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function addisDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - ADDIS_OFFSET_HOURS, minute, second));
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDay(year, month, day) {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function dayOrdinal(day) {
  const n = Number(day);
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th")}`;
}

function monthName(year, month) {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function addisDayLabel(date) {
  return new Date(date).toLocaleDateString("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function anchorDayFrom(date) {
  return zonedParts(date).day;
}

export function periodByPayout(year, month, anchorDay = 21) {
  const day = clampDay(year, month, anchorDay);
  let startYear = year;
  let startMonth = month - 1;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }
  const startDay = clampDay(startYear, startMonth, anchorDay);
  const start = addisDate(startYear, startMonth, startDay);
  const end = addisDate(year, month, day);
  const lastEarned = new Date(end.getTime() - 1000);
  return {
    key: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    anchorDay,
    start,
    end,
    payoutDate: end,
    label: monthName(year, month),
    dayLabel: dayOrdinal(day),
    windowLabel: `${addisDayLabel(start)} – ${addisDayLabel(lastEarned)}`,
  };
}

export function periodFromInstant(date = new Date(), anchorDay = 21) {
  const { year, month, day } = zonedParts(date);
  const cutoff = clampDay(year, month, anchorDay);
  let payoutYear = year;
  let payoutMonth = month;
  if (day >= cutoff) {
    payoutMonth += 1;
    if (payoutMonth > 12) {
      payoutMonth = 1;
      payoutYear += 1;
    }
  }
  return periodByPayout(payoutYear, payoutMonth, anchorDay);
}

export function currentOpenPeriod(now = new Date(), anchorDay = 21) {
  return periodFromInstant(now, anchorDay);
}

export function previousPeriod(period) {
  let year = period.year;
  let month = period.month - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return periodByPayout(year, month, period.anchorDay || period.day || 21);
}

export function listCalendarMonths(count = 8, now = new Date()) {
  const { year, month } = zonedParts(now);
  const months = [];
  let y = year;
  let m = month;
  for (let i = 0; i < count; i += 1) {
    months.push({
      key: `${y}-${pad(m)}`,
      year: y,
      month: m,
      label: monthName(y, m),
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}

export function isPeriodClosed(period, now = new Date()) {
  return now >= period.end;
}

export function periodFromKey(key, fallbackDay = 21) {
  if (!key) return null;
  const full = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    return periodByPayout(Number(full[1]), Number(full[2]), Number(full[3]));
  }
  const monthOnly = key.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) {
    return periodByPayout(Number(monthOnly[1]), Number(monthOnly[2]), fallbackDay);
  }
  return null;
}

export function serializePeriod(period) {
  if (!period) return null;
  return {
    key: period.key,
    year: period.year,
    month: period.month,
    day: period.day,
    anchorDay: period.anchorDay || period.day,
    start: period.start.toISOString(),
    end: period.end.toISOString(),
    payoutDate: period.payoutDate.toISOString(),
    label: period.label,
    dayLabel: period.dayLabel || dayOrdinal(period.day),
    windowLabel: period.windowLabel,
    closed: isPeriodClosed(period),
  };
}
