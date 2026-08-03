// Two Weekly: two fixed anchors a month, 15th and end-of-month. Pure date
// math, no FK/DB access - easy to reason about and reuse (e.g. for Pay Run 15
// later). Weekends never shift the anchor (confirmed by the client
// 2026-08-02) - the anchor day is used exactly as-is regardless of weekday.
export function nextTwoWeeklyPeriod({ periodEnd }) {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const day = end.getUTCDate();
  const isEndOfMonth = day === lastDayOfMonth(end);

  if (!isEndOfMonth) {
    // periodEnd was the 15th -> next period is 16th to end of this same month
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 16));
    const newEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
    return { periodStart: toISODate(start), periodEnd: toISODate(newEnd), payDate: toISODate(newEnd) };
  }

  // periodEnd was end-of-month -> next period is the 1st to the 15th of next month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  const newEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 15));
  return { periodStart: toISODate(start), periodEnd: toISODate(newEnd), payDate: toISODate(newEnd) };
}

function lastDayOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
