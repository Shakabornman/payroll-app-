"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { nextTwoWeeklyPeriod } from "@/lib/pay-run-periods";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatError(error) {
  const base = `${error.code ?? ""} ${error.message}`.trim();
  if (error.code === "42501") {
    return `${base}. If this is a permission error, the client needs to run GRANT INSERT, UPDATE ON payroll.pay_runs, payroll.payslips TO authenticated; in Supabase.`;
  }
  return base;
}

// Replaces the old manual-date-entry create-pay-run-dialog.jsx: no dates are
// ever typed here. Posting the current period computes the next one
// automatically (per the client's confirmed anchor-day rule, see
// lib/pay-run-periods.js) and shows it as a plain preview - nothing to
// mistype. This is the only way a new Two Weekly pay run gets created now.
export function PostPayRunDialog({ currentRun, onPosted }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const next = nextTwoWeeklyPeriod({ periodEnd: currentRun.period_end });

  async function handlePost() {
    setFormError("");
    setSubmitting(true);

    const { data: frequency, error: freqError } = await supabase
      .from("pay_frequencies")
      .select("id")
      .ilike("name", "%two weekly%")
      .maybeSingle();
    if (freqError || !frequency) {
      setFormError(freqError ? formatError(freqError) : "Could not find the Two Weekly pay frequency.");
      setSubmitting(false);
      return;
    }

    // Safety net: even with computed (not typed) dates, posting an older run
    // out of order could land on a period that already exists (e.g. leftover
    // test data). Check before touching anything.
    const { data: existing, error: existingError } = await supabase
      .from("pay_runs")
      .select("id")
      .eq("pay_frequency_id", frequency.id)
      .eq("period_start", next.periodStart)
      .eq("period_end", next.periodEnd);
    if (existingError) {
      setFormError(formatError(existingError));
      setSubmitting(false);
      return;
    }
    if (existing.length > 0) {
      setFormError(
        "The next period already exists as a pay run - select it from the list instead of posting again."
      );
      setSubmitting(false);
      return;
    }

    const { error: lockError } = await supabase
      .from("pay_runs")
      .update({ status: "finalised" })
      .eq("id", currentRun.id);
    if (lockError) {
      setFormError(formatError(lockError));
      setSubmitting(false);
      return;
    }

    const { data: newRun, error: runError } = await supabase
      .from("pay_runs")
      .insert({
        pay_frequency_id: frequency.id,
        period_start: next.periodStart,
        period_end: next.periodEnd,
        pay_date: next.payDate,
        status: "draft",
      })
      .select("id")
      .single();
    if (runError) {
      setFormError(
        `The current period was locked, but creating the next one failed: ${formatError(runError)}. ` +
          `Needs manual follow-up - there is no undo for the lock yet.`
      );
      setSubmitting(false);
      return;
    }

    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("employee_number")
      .eq("pay_frequency_id", frequency.id);
    if (employeesError) {
      setFormError(
        `The next pay run was created, but could not load employees to seed payslips: ${formatError(employeesError)}. ` +
          `The draft pay run for ${next.periodStart} – ${next.periodEnd} now exists with no payslips - needs manual follow-up.`
      );
      onPosted?.(newRun.id);
      setSubmitting(false);
      return;
    }

    const rateMap = new Map();
    if (employees.length > 0) {
      const employeeNumbers = employees.map((e) => e.employee_number);
      // Fetch all BASIC_HOURLY regular-input rows and pick the one whose
      // effective window covers the new period, in JS - avoids building a
      // raw filter string out of date values, matches the codebase's
      // established pattern of resolving employee_number-keyed joins
      // manually (no real FK on employee_number to embed against).
      const { data: rateRows } = await supabase
        .from("employee_regular_inputs")
        .select("employee_number, amount, effective_from, effective_to, pay_items!inner(code)")
        .in("employee_number", employeeNumbers)
        .eq("pay_items.code", "BASIC_HOURLY");

      for (const row of rateRows ?? []) {
        const coversWindow =
          row.effective_from <= next.periodStart && (!row.effective_to || row.effective_to >= next.periodEnd);
        if (coversWindow) {
          rateMap.set(row.employee_number, row.amount);
        }
      }
    }

    if (employees.length > 0) {
      const payslipRows = employees.map((e) => ({
        pay_run_id: newRun.id,
        employee_number: e.employee_number,
        normal_hours: 0,
        normal_rate: rateMap.get(e.employee_number) ?? null,
      }));
      const { error: payslipsError } = await supabase.from("payslips").insert(payslipRows);
      if (payslipsError) {
        setFormError(
          `The next pay run was created, but seeding payslips failed: ${formatError(payslipsError)}. ` +
            `The draft pay run for ${next.periodStart} – ${next.periodEnd} now exists with no payslips - needs manual follow-up.`
        );
        onPosted?.(newRun.id);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    setOpen(false);
    setFormError("");
    onPosted?.(newRun.id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setFormError("");
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>Post pay run</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post this pay run?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            This locks {formatDate(currentRun.period_start)} – {formatDate(currentRun.period_end)} from further
            changes and creates the next period:
          </p>
          <p className="font-medium">
            {formatDate(next.periodStart)} – {formatDate(next.periodEnd)}
          </p>
          {formError && <p className="text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handlePost} disabled={submitting}>
            {submitting ? "Posting…" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
