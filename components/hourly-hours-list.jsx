"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
    return `${base}. If this is a permission error, the client needs to run GRANT UPDATE ON payroll.payslips TO authenticated; in Supabase.`;
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
// into an input with a per-row Save. Rate is deliberately read-only here -
// it's a recurring, dated employee-level fact (like Basic Salary), set once
// via SetHourlyRateDialog on the employee's own record (reachable via the
// name link below), not something captured per pay period. Gross pay shown
// here is a simple hours x rate display value, NOT a real tax calculation -
// PAYE/UIF/SDL and payslip_lines generation are deliberately out of scope
// until the calc functions get wired in (blocked on confirming
// employees.birth_date exists).
export function HourlyHoursList({ payRunId, editable = false, onSelectEmployee }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRows(null);
      setError("");
      setEdits({});

      const { data: frequency, error: frequencyError } = await supabase
        .from("pay_frequencies")
        .select("id")
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
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [payRunId]);

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
          const canEdit = editable && row.payslip;
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
                  <Badge variant={row.payslip.finalised_at ? "default" : "secondary"}>
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
                        <p className="text-xs text-green-600 dark:text-green-400">Saved</p>
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
  );
}
