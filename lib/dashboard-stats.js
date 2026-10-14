// Dashboard numbers, worked out from the same rows the Payslip processing
// screen uses so the two always agree. Pure functions: no database access.

// Two Weekly is the only hourly frequency (same substring match used on the
// Payslip processing and Hours screens).
export function isHourlyFrequency(frequencyName) {
  return (frequencyName ?? "").toLowerCase().includes("two weekly");
}

// "Today" as a YYYY-MM-DD string in hospital time, comparable with pay_date.
export function todayInSouthAfrica(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

// payRuns: { id, status, pay_date, pay_frequencies: { name } }
// payslips: { pay_run_id, finalised_at, normal_hours } - only needed for open runs
export function computeDashboardStats({ payRuns, payslips, today }) {
  const openRuns = payRuns.filter((run) => run.status !== "finalised");
  const openIds = new Set(openRuns.map((run) => run.id));
  const frequencyByRun = new Map(payRuns.map((run) => [run.id, run.pay_frequencies?.name]));

  let awaitingFinalisation = 0;
  let hoursNotCaptured = 0;
  const runsAwaiting = new Set();
  const runsWithoutHours = new Set();

  for (const payslip of payslips) {
    if (!openIds.has(payslip.pay_run_id) || payslip.finalised_at) continue;
    awaitingFinalisation += 1;
    runsAwaiting.add(payslip.pay_run_id);
    // Same rule as the Captured column: an unfinalised hourly payslip with 0
    // (or no) hours has not had its hours captured yet.
    if (isHourlyFrequency(frequencyByRun.get(payslip.pay_run_id)) && Number(payslip.normal_hours) === 0) {
      hoursNotCaptured += 1;
      runsWithoutHours.add(payslip.pay_run_id);
    }
  }

  const pastPayDate = openRuns.filter((run) => run.pay_date && run.pay_date < today);

  return {
    openRunCount: openRuns.length,
    awaitingFinalisation,
    runsAwaitingCount: runsAwaiting.size,
    hoursNotCaptured,
    runsWithoutHoursCount: runsWithoutHours.size,
    pastPayDate,
  };
}
