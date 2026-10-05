"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { nextPeriodForFrequency } from "@/lib/pay-run-periods";
import { generatePayslipsForRun } from "@/lib/payslip-generator";
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
    return `${base}. If this is a permission error, the client needs to run GRANT INSERT, UPDATE ON payroll.pay_runs, payroll.payslips, payroll.payslip_lines TO authenticated; in Supabase.`;
  }
  return base;
}

// Works for any pay frequency (Two Weekly, Pay Run 15, Pay Run Month End) -
// this belongs on Payslip Processing, not bolted onto the hourly-specific
// Hours screen (an earlier version of this dialog only ever handled Two
// Weekly, which was the wrong place to put it). Requires `currentRun` to
// carry `pay_frequency_id` and `pay_frequencies.name` (already selected by
// app/payslips/page.js's pay_runs query).
//
// No dates are ever typed here. Posting the current period computes the next
// one automatically (per the client's confirmed anchor-day rules, see
// lib/pay-run-periods.js) and shows it as a plain preview - nothing to
// mistype. Payslip generation itself (real income lines from
// employee_regular_inputs, not a bare stub) is delegated to
// lib/payslip-generator.js.
export function PostPayRunDialog({ currentRun, onPosted }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const frequencyName = currentRun.pay_frequencies?.name;
  const next = nextPeriodForFrequency(frequencyName, { periodEnd: currentRun.period_end });

  async function handlePost() {
    if (!next) {
      setFormError(`Don't know how to compute the next period for "${frequencyName}".`);
      return;
    }

    setFormError("");
    setSubmitting(true);

    const frequencyId = currentRun.pay_frequency_id;

    // Safety net: even with computed (not typed) dates, posting an older run
    // out of order could land on a period that already exists (e.g. leftover
    // test data). Check before touching anything.
    const { data: existing, error: existingError } = await supabase
      .from("pay_runs")
      .select("id")
      .eq("pay_frequency_id", frequencyId)
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
        pay_frequency_id: frequencyId,
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

    // Only staff employed by the period end get a payslip. Hourly staff who
    // simply didn't work get one with zero hours; someone not yet started
    // (or with no start date on record) gets none. Inactive staff are skipped; a
    // payslip is generated again once they are reactivated. Leavers still need a
    // last-day field before they can be excluded here too.
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("employee_number")
      .eq("pay_frequency_id", frequencyId)
      .eq("is_active", true)
      .not("employment_date", "is", null)
      .lte("employment_date", next.periodEnd);
    if (employeesError) {
      setFormError(
        `The next pay run was created, but could not load employees to seed payslips: ${formatError(employeesError)}. ` +
          `The draft pay run for ${next.periodStart} – ${next.periodEnd} now exists with no payslips - needs manual follow-up.`
      );
      onPosted?.(newRun.id);
      setSubmitting(false);
      return;
    }

    const { error: generateError } = await generatePayslipsForRun({
      payRunId: newRun.id,
      employeeNumbers: employees.map((e) => e.employee_number),
      periodStart: next.periodStart,
      periodEnd: next.periodEnd,
      frequencyName,
    });
    if (generateError) {
      setFormError(
        `The next pay run was created, but generating payslips failed: ${formatError(generateError)}. ` +
          `The draft pay run for ${next.periodStart} – ${next.periodEnd} now exists with no payslips - needs manual follow-up.`
      );
      onPosted?.(newRun.id);
      setSubmitting(false);
      return;
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
            {next ? `${formatDate(next.periodStart)} – ${formatDate(next.periodEnd)}` : "—"}
          </p>
          {formError && <p className="text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handlePost} disabled={submitting || !next}>
            {submitting ? "Posting…" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
