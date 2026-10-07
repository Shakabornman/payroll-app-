"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { nextPeriodForFrequency } from "@/lib/pay-run-periods";
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
    return `${base}. If this is a permission error, the client needs to run GRANT UPDATE ON payroll.pay_runs TO authenticated; in Supabase.`;
  }
  return base;
}

// Client-confirmed rule (2026-10-04): a payslip can't be unfinalised while
// its pay run is still locked - Post already relied on that run's finalised
// state to compute and create the next period, so reopening one payslip
// underneath a still-finalised run risks the posted totals drifting out of
// sync with what the next period was generated from. The run itself has to
// come back to draft first; only then does PayslipsContent let
// UnfinalisePayslipsDialog render. See BulkFinaliseDialog / PostPayRunDialog
// for the forward-direction equivalents this mirrors.
export function UnfinalisePayRunDialog({ payRun, onUnfinalised }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [nextRunExists, setNextRunExists] = useState(null);

  const frequencyName = payRun.pay_frequencies?.name;
  const next = nextPeriodForFrequency(frequencyName, { periodEnd: payRun.period_end });

  async function checkNextRun() {
    setNextRunExists(null);
    if (!next) return;
    const { data } = await supabase
      .from("pay_runs")
      .select("id")
      .eq("pay_frequency_id", payRun.pay_frequency_id)
      .eq("period_start", next.periodStart)
      .eq("period_end", next.periodEnd);
    setNextRunExists((data ?? []).length > 0);
  }

  async function handleUnfinalise() {
    setFormError("");
    setSubmitting(true);

    const { error } = await supabase
      .from("pay_runs")
      .update({ status: "draft" })
      .eq("id", payRun.id);

    if (error) {
      setFormError(formatError(error));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setOpen(false);
    onUnfinalised?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setFormError("");
        if (nextOpen) checkNextRun();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Unfinalise pay run</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unfinalise this pay run?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            This reopens {formatDate(payRun.period_start)} – {formatDate(payRun.period_end)} for changes.
            Once it&apos;s back to draft, individual payslips inside it can be unfinalised too.
          </p>
          {nextRunExists && (
            <p className="text-warning-foreground">
              A later pay run already exists for this frequency ({formatDate(next.periodStart)} –{" "}
              {formatDate(next.periodEnd)} onward). Its payslips were generated based on this period
              already being finalised — reopening this one won&apos;t undo that automatically.
            </p>
          )}
          {formError && <p className="text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleUnfinalise} disabled={submitting} variant="destructive">
            {submitting ? "Unfinalising…" : "Unfinalise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
