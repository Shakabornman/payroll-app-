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

// Pay Run 15: one fixed anchor a month, the 15th. Period is always
// 16th-of-prior-month to 15th-of-current-month (matches the real label
// format "The Month Ending 15 April 2026 - Pay Run 15", confirmed by the
// client 2026-08-02). Weekends never shift the anchor, same as Two Weekly.
export function nextPayRun15Period({ periodEnd }) {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 16));
  const newEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 15));
  return { periodStart: toISODate(start), periodEnd: toISODate(newEnd), payDate: toISODate(newEnd) };
}

// Pay Run Month End: calendar month, 1st to last day. No anchor-day
// ambiguity at all - every month is its own whole period.
export function nextPayRunMonthEndPeriod({ periodEnd }) {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  const newEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 2, 0));
  return { periodStart: toISODate(start), periodEnd: toISODate(newEnd), payDate: toISODate(newEnd) };
}

// Dispatches on the pay_frequencies.name string so callers (e.g.
// PostPayRunDialog) don't need their own frequency-name branching logic.
// Matches the same substring patterns used elsewhere in the app
// (pay-run-list.jsx, hourly-hours-list.jsx) to identify a frequency by name.
export function nextPeriodForFrequency(frequencyName, { periodEnd }) {
  const name = (frequencyName ?? "").toLowerCase();
  if (name.includes("two weekly")) return nextTwoWeeklyPeriod({ periodEnd });
  if (name.includes("pay run 15")) return nextPayRun15Period({ periodEnd });
  if (name.includes("month end")) return nextPayRunMonthEndPeriod({ periodEnd });
  return null;
}

function lastDayOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
