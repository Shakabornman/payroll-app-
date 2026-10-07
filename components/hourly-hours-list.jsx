"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { recalculatePayslip } from "@/lib/payslip-calculator";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatMoney(value) {
  if (value === null || value === undefined) return "—";
  return `R ${Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

function formatHours(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2 });
}

function formatSaveError(error) {
  const base = `${error.code ?? ""} ${error.message}`.trim();
  if (error.code === "42501") {
    return `${base}. If this is a permission error, the client needs to run GRANT UPDATE ON payroll.payslips TO authenticated; and GRANT INSERT, UPDATE ON payroll.payslip_lines TO authenticated; in Supabase.`;
  }
  return base;
}

// Scoped to employees currently assigned the "Two Weekly" (hourly) frequency
// only - per client requirement (2026-08-02): showing the full company
// roster here "will create a bigger chance of errors."
//
// Employees with no payslip row for this pay run are shown as "No hours
// captured" rather than left out entirely - hourly staff here are an ad hoc/
// on-call pool and legitimately aren't called in every period (see
// hae-payroll-architecture memory), so silently omitting them would be
// indistinguishable from the employee list itself being wrong.
//
// `editable` (true for a draft/non-finalised pay run) turns the Hours cell
// into an input with a per-row Save - but only for payslips that haven't
// themselves been individually finalised yet (via BulkFinaliseDialog); a
// finalised payslip locks its own hours regardless of the pay run's own
// status, matching the real system's two separate locks (payslip-level
// finalise vs pay-run-level post). Rate is deliberately read-only here -
// it's a recurring, dated employee-level fact (like Basic Salary), set once
// via SetHourlyRateDialog on the employee's own record (reachable via the
// name link below), not something captured per pay period. Saving hours
// keeps the BASIC_HOURLY payroll.payslip_lines row in sync (see handleSave),
// then triggers a live PAYE/UIF/SDL recalculation (lib/payslip-calculator.js)
// so Nett Pay on Payslip Processing reflects it immediately - matching
// SimplePay's own behaviour of recalculating as you update detail, not a
// separate "Calculate" step. Not shown on this screen itself (Hours stays
// capture-only, see the architecture note in app/hours/page.js) - view the
// breakdown via the employee's payslip detail.
export function HourlyHoursList({ payRunId, periodStart, periodEnd, editable = false, onSelectEmployee }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState({});
  const [basicHourlyPayItemId, setBasicHourlyPayItemId] = useState(null);
  const [frequencyName, setFrequencyName] = useState(null);
  const [calcWarnings, setCalcWarnings] = useState([]);
  const [recalcBusy, setRecalcBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRows(null);
      setError("");
      setEdits({});

      const { data: frequency, error: frequencyError } = await supabase
        .from("pay_frequencies")
        .select("id, name")
        .ilike("name", "%two weekly%")
        .maybeSingle();

      if (cancelled) return;

      if (frequencyError || !frequency) {
        setError(
          frequencyError
            ? `${frequencyError.code ?? ""} ${frequencyError.message}`.trim()
            : "Could not find the Two Weekly pay frequency."
        );
        return;
      }

      setFrequencyName(frequency.name);

      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("employee_number, full_name, job_title")
        .eq("pay_frequency_id", frequency.id)
        .order("full_name");

      if (cancelled) return;

      if (employeesError) {
        setError(`${employeesError.code ?? ""} ${employeesError.message}`.trim());
        return;
      }

      // No FK on employee_number to embed payslips directly (same reason
      // payslip-run-list.jsx does a manual merge instead of a nested select).
      const { data: payslips, error: payslipsError } = await supabase
        .from("payslips")
        .select("id, employee_number, normal_hours, normal_rate, gross_remuneration, finalised_at")
        .eq("pay_run_id", payRunId);

      if (cancelled) return;

      if (payslipsError) {
        setError(`${payslipsError.code ?? ""} ${payslipsError.message}`.trim());
        return;
      }

      const byEmployee = new Map((payslips ?? []).map((p) => [p.employee_number, p]));
      const merged = (employees ?? []).map((employee) => ({
        ...employee,
        payslip: byEmployee.get(employee.employee_number) ?? null,
      }));

      setRows(merged);

      // Needed by handleSave to keep the BASIC_HOURLY payslip_lines row in
      // sync with hours worked - fetched once here rather than per-save.
      const { data: payItem } = await supabase
        .from("pay_items")
        .select("id")
        .eq("code", "BASIC_HOURLY")
        .maybeSingle();
      if (!cancelled && payItem) {
        setBasicHourlyPayItemId(payItem.id);
      }

    }

    run();
    return () => {
      cancelled = true;
    };
  }, [payRunId, periodStart, periodEnd]);

  async function recalculateAll() {
    setCalcWarnings([]);
    setRecalcBusy(true);
      // Reconcile rate for payslips that don't already match the employee's
      // current BASIC_HOURLY regular input - covers both a payslip created
      // before any rate existed (normal_rate null) and a same-period rate
      // correction (see below). Skips finalised payslips - those are locked,
      // same rule as hours editing.
      const candidates = rows.filter((row) => row.payslip && !row.payslip.finalised_at);
      const ratePatches = [];
      if (candidates.length > 0 && periodStart && periodEnd) {
        const { data: regularInputs } = await supabase
          .from("employee_regular_inputs")
          .select("employee_number, amount, effective_from, effective_to, created_at, pay_items(code)")
          .in("employee_number", candidates.map((row) => row.employee_number));

        if (regularInputs) {
          // Corrections are inserted as a new row rather than editing the
          // old one (the documented "raise = new row" rule), so more than
          // one row can legitimately cover the same period for the same
          // employee (e.g. fixing a typo'd rate same-day). Resolve to a
          // single row: latest effective_from wins, ties broken by latest
          // created_at (the more recently entered correction).
          const coveringByEmployee = new Map();
          for (const input of regularInputs) {
            if (input.pay_items?.code !== "BASIC_HOURLY") continue;
            const covers = input.effective_from <= periodEnd && (!input.effective_to || input.effective_to >= periodStart);
            if (!covers) continue;
            const current = coveringByEmployee.get(input.employee_number);
            if (
              !current ||
              input.effective_from > current.effective_from ||
              (input.effective_from === current.effective_from && input.created_at > current.created_at)
            ) {
              coveringByEmployee.set(input.employee_number, input);
            }
          }

          for (const row of candidates) {
            const current = coveringByEmployee.get(row.employee_number);
            if (!current) continue;
            const rate = Number(current.amount);
            if (rate === row.payslip.normal_rate) continue;
            const grossRemuneration = row.payslip.normal_hours != null ? row.payslip.normal_hours * rate : null;
            const { error: syncError } = await supabase
              .from("payslips")
              .update({ normal_rate: rate, gross_remuneration: grossRemuneration })
              .eq("id", row.payslip.id);
            if (!syncError) {
              ratePatches.push({ payslipId: row.payslip.id, normal_rate: rate, gross_remuneration: grossRemuneration });
              if (basicHourlyPayItemId && grossRemuneration != null) {
                const { data: hourlyLine } = await supabase
                  .from("payslip_lines")
                  .select("id")
                  .eq("pay_run_id", payRunId)
                  .eq("employee_number", row.employee_number)
                  .eq("pay_item_id", basicHourlyPayItemId)
                  .maybeSingle();
                if (hourlyLine) {
                  await supabase.from("payslip_lines").update({ amount: grossRemuneration }).eq("id", hourlyLine.id);
                } else {
                  await supabase.from("payslip_lines").insert({
                    pay_run_id: payRunId,
                    employee_number: row.employee_number,
                    pay_item_id: basicHourlyPayItemId,
                    amount: grossRemuneration,
                  });
                }
              }
            }
          }

          if (ratePatches.length > 0) {
            const patchById = new Map(ratePatches.map((p) => [p.payslipId, p]));
            setRows((prev) =>
              prev.map((r) => {
                const patch = r.payslip ? patchById.get(r.payslip.id) : null;
                return patch
                  ? { ...r, payslip: { ...r.payslip, normal_rate: patch.normal_rate, gross_remuneration: patch.gross_remuneration } }
                  : r;
              })
            );
          }
        }
      }

      // Live-calc PAYE/UIF/SDL for every non-finalised payslip that already
      // has a gross amount - matches SimplePay's own "recalculate as you go"
      // behaviour, and self-heals payslips saved before this feature existed
      // (same reconcile-on-load pattern as the rate fix above). Not gated on
      // writes, not state updates this component reads back.
      if (frequency.name) {
        const patchedGross = new Map(ratePatches.map((p) => [p.payslipId, p.gross_remuneration]));
        const results = await Promise.all(
          merged
            .filter((row) => row.payslip && !row.payslip.finalised_at)
            .map((row) => {
              const gross = patchedGross.has(row.payslip.id)
                ? patchedGross.get(row.payslip.id)
                : row.payslip.gross_remuneration;
              if (gross == null) return null;
              return recalculatePayslip({
                payslipId: row.payslip.id,
                employeeNumber: row.employee_number,
                payRunId,
                frequencyName: frequency.name,
                periodEnd,
              }).then((result) => ({ employeeNumber: row.employee_number, ...result }));
            })
        );

        {
          const messages = [
            ...new Set(
              results
                .filter(Boolean)
                .flatMap((r) => (r.warnings ?? []).map((w) => `${r.employeeNumber}: ${w}`))
            ),
          ];
          setCalcWarnings(messages);
        }
      }

    await logAudit({
      action: "recalculate_payslips",
      entity: "pay_run",
      entityId: payRunId,
      payRunId,
      details: { payslips: rows.filter((r) => r.payslip && !r.payslip.finalised_at).length },
    });
    setRecalcBusy(false);
  }

  function editState(payslip) {
    return (
      edits[payslip.id] ?? {
        hours: String(payslip.normal_hours ?? 0),
        status: "idle",
        message: "",
      }
    );
  }

  function updateEdit(payslipId, patch) {
    setEdits((prev) => ({ ...prev, [payslipId]: { ...prev[payslipId], ...patch } }));
  }

  async function handleSave(row) {
    const payslip = row.payslip;
    const state = editState(payslip);
    const hours = Number(state.hours);

    if (Number.isNaN(hours) || hours < 0) {
      updateEdit(payslip.id, { status: "error", message: "Enter a non-negative number of hours." });
      return;
    }

    updateEdit(payslip.id, { status: "saving", message: "" });

    // Display-only: hours x the rate already on the payslip (set separately
    // via SetHourlyRateDialog, this component doesn't own rate) - not a real
    // gross calc (no allowances, overtime, deductions - that's payslip_lines
    // + calc-function territory).
    const grossRemuneration = payslip.normal_rate != null ? hours * payslip.normal_rate : null;

    // normal_rate is deliberately omitted from this update - this component
    // no longer edits it, and re-sending the stale in-memory value could
    // clobber a rate set concurrently via SetHourlyRateDialog.
    const { error: saveError } = await supabase
      .from("payslips")
      .update({ normal_hours: hours, gross_remuneration: grossRemuneration })
      .eq("id", payslip.id);

    if (saveError) {
      updateEdit(payslip.id, { status: "error", message: formatSaveError(saveError) });
      return;
    }

    // Keep the BASIC_HOURLY income line in sync with hours worked - without
    // this, payroll.payslip_lines never reflects captured hours at all (the
    // payslip generator only creates lines for 'recurring' items at
    // creation time; hourly pay is 'rate_times_quantity', so its line has to
    // be kept current here as hours change).
    if (basicHourlyPayItemId && grossRemuneration != null) {
      const { data: existingLine } = await supabase
        .from("payslip_lines")
        .select("id")
        .eq("pay_run_id", payRunId)
        .eq("employee_number", row.employee_number)
        .eq("pay_item_id", basicHourlyPayItemId)
        .maybeSingle();

      const lineError = existingLine
        ? (await supabase.from("payslip_lines").update({ amount: grossRemuneration }).eq("id", existingLine.id))
            .error
        : (
            await supabase.from("payslip_lines").insert({
              pay_run_id: payRunId,
              employee_number: row.employee_number,
              pay_item_id: basicHourlyPayItemId,
              amount: grossRemuneration,
            })
          ).error;

      if (lineError) {
        updateEdit(payslip.id, { status: "error", message: formatSaveError(lineError) });
        return;
      }
    }

    // Live recalc, matching SimplePay's own behaviour - Nett Pay on Payslip
    // Processing should reflect these hours immediately, not after a
    // separate step. Warnings (e.g. missing birth date) surface below the
    // table rather than being swallowed silently - see calcWarnings.
    const { warnings: recalcWarnings } = await recalculatePayslip({
      payslipId: payslip.id,
      employeeNumber: row.employee_number,
      payRunId,
      frequencyName,
      periodEnd,
    });
    if (recalcWarnings.length > 0) {
      setCalcWarnings((prev) => [
        ...new Set([...prev, ...recalcWarnings.map((w) => `${row.employee_number}: ${w}`)]),
      ]);
    }

    setRows((prev) =>
      prev.map((r) =>
        r.payslip?.id === payslip.id
          ? { ...r, payslip: { ...r.payslip, normal_hours: hours, gross_remuneration: grossRemuneration } }
          : r
      )
    );
    updateEdit(payslip.id, { hours: String(hours), status: "saved", message: "" });
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load hours: {error}</p>;
  }

  if (rows === null) {
    return <p className="text-sm text-muted-foreground">Loading hourly staff…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No employees currently assigned the Two Weekly frequency.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={recalculateAll} disabled={recalcBusy}>
          {recalcBusy ? "Recalculating…" : "Recalculate payslips"}
        </Button>
      </div>
      {calcWarnings.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="mb-1 font-medium">Nett Pay could not be fully calculated for some employees:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {calcWarnings.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Employee #</TableHead>
          <TableHead>Job title</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Gross pay</TableHead>
          <TableHead>Status</TableHead>
          {editable && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          // A payslip that's been individually finalised (via
          // BulkFinaliseDialog) locks its own hours from editing regardless
          // of whether the whole pay run has been posted yet - these are two
          // separate locks (payslip-level finalise vs pay-run-level post).
          const canEdit = editable && row.payslip && !row.payslip.finalised_at;
          const state = canEdit ? editState(row.payslip) : null;

          return (
            <TableRow key={row.employee_number}>
              <TableCell>
                {onSelectEmployee ? (
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() =>
                      onSelectEmployee({
                        employee_number: row.employee_number,
                        full_name: row.full_name,
                        job_title: row.job_title,
                      })
                    }
                  >
                    {row.full_name}
                  </button>
                ) : (
                  row.full_name
                )}
              </TableCell>
              <TableCell>{row.employee_number}</TableCell>
              <TableCell>{row.job_title ?? "—"}</TableCell>
              <TableCell>
                {canEdit ? (
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    className="w-20"
                    value={state.hours}
                    onChange={(event) => updateEdit(row.payslip.id, { hours: event.target.value, status: "idle" })}
                  />
                ) : row.payslip ? (
                  formatHours(row.payslip.normal_hours)
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{row.payslip ? formatMoney(row.payslip.normal_rate) : "—"}</TableCell>
              <TableCell>{row.payslip ? formatMoney(row.payslip.gross_remuneration) : "—"}</TableCell>
              <TableCell>
                {row.payslip ? (
                  <Badge variant={row.payslip.finalised_at ? "success" : "warning"}>
                    {row.payslip.finalised_at ? "Finalised" : "Draft"}
                  </Badge>
                ) : (
                  <Badge variant="outline">No hours captured</Badge>
                )}
              </TableCell>
              {editable && (
                <TableCell>
                  {canEdit && (
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state.status === "saving"}
                        onClick={() => handleSave(row)}
                      >
                        Save
                      </Button>
                      {state.status === "saving" && <p className="text-xs text-muted-foreground">Saving…</p>}
                      {state.status === "saved" && (
                        <p className="text-xs text-primary">Saved</p>
                      )}
                      {state.status === "error" && <p className="text-xs text-destructive">{state.message}</p>}
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
      </Table>
    </div>
  );
}
