import { supabase } from "@/lib/supabase";
import { recalculatePayslip } from "@/lib/payslip-calculator";

// Generates real payslips for a newly created pay run - not the bare stub
// this replaced (which only ever set normal_hours: 0, no income lines at
// all). Reads each employee's active employee_regular_inputs and creates a
// real payroll.payslip_lines row for every 'recurring' item (e.g. Basic
// Salary) - this is the piece that was completely missing for salaried
// staff. For 'rate_times_quantity' items (e.g. Basic Hourly Pay) the stored
// amount is the rate, seeded onto payslips.normal_rate; the quantity (hours)
// is still captured later, per period, on the Hours screen.
export async function generatePayslipsForRun({ payRunId, employeeNumbers, periodStart, periodEnd, frequencyName }) {
  if (employeeNumbers.length === 0) return { error: null };

  const { data: regularInputs, error: inputsError } = await supabase
    .from("employee_regular_inputs")
    .select("employee_number, amount, effective_from, effective_to, created_at, pay_items(id, code, input_type)")
    .in("employee_number", employeeNumbers);
  if (inputsError) return { error: inputsError };

  const activeByEmployee = new Map();
  for (const row of regularInputs ?? []) {
    const covers = row.effective_from <= periodEnd && (!row.effective_to || row.effective_to >= periodStart);
    if (!covers) continue;
    const list = activeByEmployee.get(row.employee_number) ?? [];
    list.push(row);
    activeByEmployee.set(row.employee_number, list);
  }

  // Corrections are inserted as a new row rather than editing the old one
  // (documented "raise = new row" rule), so more than one row can
  // legitimately cover the same period for the same pay item (e.g. fixing a
  // typo'd amount same-day). Resolve to one row per pay item: latest
  // effective_from wins, ties broken by latest created_at - otherwise a
  // correction would either get ignored or, for recurring items, double-
  // counted into the gross.
  function currentPerPayItem(inputs) {
    const byPayItem = new Map();
    for (const input of inputs) {
      const payItemId = input.pay_items?.id;
      if (!payItemId) continue;
      const current = byPayItem.get(payItemId);
      if (
        !current ||
        input.effective_from > current.effective_from ||
        (input.effective_from === current.effective_from && input.created_at > current.created_at)
      ) {
        byPayItem.set(payItemId, input);
      }
    }
    return [...byPayItem.values()];
  }

  const payslipRows = [];
  const payslipLineRows = [];

  for (const employeeNumber of employeeNumbers) {
    const inputs = currentPerPayItem(activeByEmployee.get(employeeNumber) ?? []);
    const recurring = inputs.filter((input) => input.pay_items?.input_type === "recurring");
    const hourlyInput = inputs.find((input) => input.pay_items?.code === "BASIC_HOURLY");
    const recurringGross = recurring.reduce((sum, input) => sum + Number(input.amount), 0);

    payslipRows.push({
      pay_run_id: payRunId,
      employee_number: employeeNumber,
      normal_hours: hourlyInput ? 0 : null,
      normal_rate: hourlyInput ? hourlyInput.amount : null,
      gross_remuneration: recurring.length > 0 ? recurringGross : null,
    });

    for (const input of recurring) {
      payslipLineRows.push({
        pay_run_id: payRunId,
        employee_number: employeeNumber,
        pay_item_id: input.pay_items.id,
        amount: input.amount,
      });
    }
  }

  const { data: insertedPayslips, error: payslipsError } = await supabase
    .from("payslips")
    .insert(payslipRows)
    .select("id, employee_number");
  if (payslipsError) return { error: payslipsError };

  if (payslipLineRows.length > 0) {
    const { error: linesError } = await supabase.from("payslip_lines").insert(payslipLineRows);
    if (linesError) return { error: linesError };
  }

  // Live-calc PAYE/UIF/SDL immediately - matches SimplePay's own behaviour of
  // keeping Nett Pay current as soon as gross is known, not deferred to a
  // separate step. Best-effort per employee: one person's calc failure (e.g.
  // missing birth date) shouldn't fail the whole pay-run creation.
  const warnings = [];
  for (const row of insertedPayslips ?? []) {
    const result = await recalculatePayslip({
      payslipId: row.id,
      employeeNumber: row.employee_number,
      payRunId,
      frequencyName,
      periodEnd,
    });
    warnings.push(...result.warnings);
  }

  return { error: null, warnings };
}
