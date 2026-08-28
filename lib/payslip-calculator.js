import { supabase } from "@/lib/supabase";

// South African tax year runs 1 March - end of February, named by the year
// it ENDS (SARS "year of assessment" convention: the "2026 tax year" is
// 1 Mar 2025 - 28 Feb 2026). Not yet confirmed that calculate_paye_period's
// p_tax_year argument follows this exact convention - these functions have
// only ever been called from the SQL Editor before now. Validate the first
// real PAYE result against a known real SimplePay figure before trusting it.
export function taxYearForDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getUTCMonth(); // 0 = Jan
  const year = date.getUTCFullYear();
  return month <= 1 ? year : year + 1; // Jan/Feb still belong to the year ending that Feb
}

// Two Weekly is genuinely twice-a-month (24 payments/year), not calendar
// fortnightly (26) - confirmed via pay_frequencies.period_rule
// (SEMIMONTHLY:cutoff_a_day/cutoff_b_day), see hae-payroll-architecture memory.
export function periodsPerYearForFrequency(frequencyName) {
  const name = (frequencyName ?? "").toLowerCase();
  if (name.includes("two weekly")) return 24;
  if (name.includes("pay run 15")) return 12;
  if (name.includes("month end")) return 12;
  return null;
}

// SA ID numbers encode date of birth in their first 6 digits (YYMMDD) -
// derived here as a fallback for employees with no payroll.employees.
// birth_date on record (see caller). Strips a spurious trailing ".0" first -
// a known Excel/CSV import artifact where a long numeric-looking ID gets
// coerced to a float (e.g. "6810230335081.0", confirmed live 2026-08-27) -
// this is a lossless, mechanical correction, not a guess: only an exact
// ".0" suffix is stripped, any other decimal is left to correctly fail
// validation below. Only matches a strict 13-digit numeric SA ID - a
// foreign national's passport/permit number will correctly fail this and
// fall through rather than being misparsed. Century is inferred: prefer the
// 2000s reading unless it's in the future (an employee can't be born after
// today), otherwise fall back to 1900s - resolves every real ID number
// checked so far (all pre-2000 births) without needing a real century digit.
export function birthDateFromSaIdNumber(idNumber) {
  const digits = String(idNumber ?? "").trim().replace(/\.0$/, "");
  if (!/^\d{13}$/.test(digits)) return null;

  const yy = Number(digits.slice(0, 2));
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const currentYear = new Date().getUTCFullYear();
  const year2000s = 2000 + yy;
  const year = year2000s <= currentYear ? year2000s : 1900 + yy;
  return `${year}-${mm}-${dd}`;
}

async function payItemIdByCode(code) {
  const { data } = await supabase.from("pay_items").select("id").eq("code", code).maybeSingle();
  return data?.id ?? null;
}

async function upsertPayslipLine({ payRunId, employeeNumber, payItemId, amount }) {
  const { data: existing } = await supabase
    .from("payslip_lines")
    .select("id")
    .eq("pay_run_id", payRunId)
    .eq("employee_number", employeeNumber)
    .eq("pay_item_id", payItemId)
    .maybeSingle();

  if (existing) {
    return supabase.from("payslip_lines").update({ amount }).eq("id", existing.id);
  }
  return supabase
    .from("payslip_lines")
    .insert({ pay_run_id: payRunId, employee_number: employeeNumber, pay_item_id: payItemId, amount });
}

// Live recalculation of PAYE/UIF/SDL for one payslip - called every time
// gross-affecting data is saved for a non-finalised payslip (hours capture,
// pay-run generation), matching SimplePay's own behaviour of keeping Nett
// Pay current as you go, not a separate "Calculate" step. All amounts are
// stored as positive magnitudes - payroll.pay_items.category (deduction /
// statutory / employer_contribution) is what tells the UI how to group them
// (see employee-payslip-detail.jsx's lineGroup), not the sign of the amount.
//
// v1 simplification, stated plainly rather than silently assumed: taxable
// income = full gross_remuneration. payroll.pay_items has no is_taxable-style
// flag yet, and the only pay items actually in live use (BASIC_HOURLY,
// BASIC_SALARY) are both plain taxable income anyway. Also only handles
// tax_treatment='regular' income - 'irregular_annualized' custom items
// (Daily Rate, Extra Shift) would need calculate_paye_annual's annualisation
// path, not built here since none of those are in live use yet.
//
// PAYE is deliberately skipped (not guessed) if the employee has no
// birth_date on record in Supabase - see the warnings array for why. Nett
// Pay is left null in that case rather than shown minus PAYE, since PAYE is
// usually the largest deduction and a partial number could be mistaken for
// final.
export async function recalculatePayslip({ payslipId, employeeNumber, payRunId, frequencyName, periodEnd }) {
  const warnings = [];

  const { data: payslip, error: payslipError } = await supabase
    .from("payslips")
    .select("gross_remuneration")
    .eq("id", payslipId)
    .maybeSingle();
  if (payslipError) return { error: payslipError, warnings };

  const gross = payslip?.gross_remuneration;
  if (gross == null) {
    // Nothing to calculate yet (e.g. hourly employee with no hours captured
    // this period) - clear any stale totals rather than leaving a previous
    // save's numbers on display.
    await supabase
      .from("payslips")
      .update({ gross_remuneration_taxable: null, nett_pay: null, cost_to_company: null })
      .eq("id", payslipId);
    return { error: null, warnings, cleared: true };
  }

  const periodsPerYear = periodsPerYearForFrequency(frequencyName);
  if (!periodsPerYear) {
    warnings.push(`Unrecognised pay frequency "${frequencyName}" - cannot determine periods/year for UIF/PAYE.`);
    return { error: null, warnings };
  }

  const taxableGross = gross; // v1 simplification, see file comment above

  // birth_date is required for PAYE (age-based rebate); uif_exempt (real
  // classification data, confirmed live 2026-08-27) means the employee's
  // earnings don't attract UIF at all, on either side - the standard SA
  // reading of a UIF exemption category (e.g. pension/retirement income
  // only), not calculated with a rate of zero. payroll.employees.birth_date
  // (added 2026-08-27 for the small set of employees with no valid SA ID
  // number) takes priority when set; everyone else falls back to deriving
  // it from id_number (see birthDateFromSaIdNumber above).
  let birthDate = null;
  let uifExempt = false;
  const { data: employeeRow, error: employeeError } = await supabase
    .from("employees")
    .select("birth_date, id_number, uif_exempt")
    .eq("employee_number", employeeNumber)
    .maybeSingle();
  if (employeeError) {
    warnings.push(`Could not read employee record: ${employeeError.code ?? ""} ${employeeError.message}`.trim());
  } else {
    birthDate = employeeRow?.birth_date ?? birthDateFromSaIdNumber(employeeRow?.id_number);
    uifExempt = Boolean(employeeRow?.uif_exempt);
    if (!birthDate) {
      warnings.push(
        "PAYE not calculated: no birth_date on record and no valid 13-digit SA ID number to derive one from."
      );
    }
  }

  const [uifEmployeeResult, uifEmployerResult, sdlResult] = await Promise.all([
    uifExempt
      ? Promise.resolve({ data: 0, error: null })
      : supabase.rpc("calculate_uif_employee", { period_gross_remuneration: taxableGross, periods_per_year: periodsPerYear }),
    uifExempt
      ? Promise.resolve({ data: 0, error: null })
      : supabase.rpc("calculate_uif_employer", { period_gross_remuneration: taxableGross, periods_per_year: periodsPerYear }),
    // Client confirmed 2026-08-27: uif_exempt implies SDL-exempt too, not
    // just for this employee's specific reason code - treat as one flag.
    uifExempt
      ? Promise.resolve({ data: 0, error: null })
      : supabase.rpc("calculate_sdl", { period_leviable_remuneration: taxableGross }),
  ]);

  if (uifEmployeeResult.error)
    warnings.push(`UIF (employee) calc failed: ${uifEmployeeResult.error.code ?? ""} ${uifEmployeeResult.error.message}`.trim());
  if (uifEmployerResult.error)
    warnings.push(`UIF (employer) calc failed: ${uifEmployerResult.error.code ?? ""} ${uifEmployerResult.error.message}`.trim());
  if (sdlResult.error) warnings.push(`SDL calc failed: ${sdlResult.error.code ?? ""} ${sdlResult.error.message}`.trim());

  // A null RPC result (e.g. no matching row internally) must not become 0 -
  // Number(null) is 0 in JS, which would silently write a wrong "R0.00" line
  // instead of flagging missing data.
  if (!uifEmployeeResult.error && uifEmployeeResult.data == null)
    warnings.push("UIF (employee) calc returned no result.");
  if (!uifEmployerResult.error && uifEmployerResult.data == null)
    warnings.push("UIF (employer) calc returned no result.");
  if (!sdlResult.error && sdlResult.data == null) warnings.push("SDL calc returned no result.");

  const uifEmployee = uifEmployeeResult.error || uifEmployeeResult.data == null ? null : Number(uifEmployeeResult.data);
  const uifEmployer = uifEmployerResult.error || uifEmployerResult.data == null ? null : Number(uifEmployerResult.data);
  const sdl = sdlResult.error || sdlResult.data == null ? null : Number(sdlResult.data);

  let paye = null;
  if (birthDate) {
    const taxYear = taxYearForDate(periodEnd);
    const { data: payeResult, error: payeError } = await supabase.rpc("calculate_paye_period", {
      period_taxable_income: taxableGross,
      birth_date: birthDate,
      p_tax_year: taxYear,
      periods_per_year: periodsPerYear,
    });
    if (payeError) {
      warnings.push(`PAYE calc failed: ${payeError.code ?? ""} ${payeError.message}`.trim());
    } else if (payeResult == null) {
      // payroll.calculate_paye_annual returns null (not an error) when
      // payroll.tax_brackets has no row for this tax_year - would otherwise
      // silently become 0 via Number(null).
      warnings.push(`PAYE not calculated: no tax bracket data found for tax year ${taxYear}.`);
    } else {
      paye = Number(payeResult);
    }
  }

  const lineWrites = [
    { code: "UIF_EE", amount: uifEmployee },
    { code: "UIF_ER", amount: uifEmployer },
    { code: "SDL_ER", amount: sdl },
    { code: "PAYE", amount: paye },
  ];

  for (const { code, amount } of lineWrites) {
    if (amount == null) continue;
    const payItemId = await payItemIdByCode(code);
    if (!payItemId) {
      warnings.push(`Could not write ${code}: no matching payroll.pay_items row for this code.`);
      continue;
    }
    const { error: lineError } = await upsertPayslipLine({ payRunId, employeeNumber, payItemId, amount });
    if (lineError) warnings.push(`Could not save ${code} line: ${lineError.code ?? ""} ${lineError.message}`.trim());
  }

  const nettPay = paye != null && uifEmployee != null ? taxableGross - paye - uifEmployee : null;
  const costToCompany = uifEmployer != null && sdl != null ? taxableGross + uifEmployer + sdl : null;

  const { error: updateError } = await supabase
    .from("payslips")
    .update({ gross_remuneration_taxable: taxableGross, nett_pay: nettPay, cost_to_company: costToCompany })
    .eq("id", payslipId);
  if (updateError) warnings.push(`Could not save totals: ${updateError.code ?? ""} ${updateError.message}`.trim());

  return { error: null, warnings, paye, uifEmployee, uifEmployer, sdl, nettPay, costToCompany };
}
