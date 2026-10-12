export function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function etb(value) {
  return money(value);
}

export function hoursFromMinutes(minutes) {
  return money(Number(minutes || 0) / 60);
}

export function minutesFromSeconds(seconds) {
  return money(Math.max(0, Number(seconds || 0) / 60));
}
