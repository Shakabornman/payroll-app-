"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { recalculatePayslip } from "@/lib/payslip-calculator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatError(error) {
  const base = `${error.code ?? ""} ${error.message}`.trim();
  if (error.code === "42501") {
    return `${base}. If this is a permission error, the client needs to run GRANT UPDATE, DELETE ON payroll.payslip_lines TO authenticated; in Supabase.`;
  }
  return base;
}

// Edit or remove a once-off income/deduction already on this one payslip
// (Extra Shift, Shift Deduction, Repayment of Advance - see
// add-payslip-line-dialog.jsx for why statutory and Regular-input-backed
// lines never get this). Unlike Regular inputs, a line here never carries
// into another period, so there's no history to protect - the only rule is
// finalisation, re-checked fresh on every save rather than trusted from when
// the dialog opened.
export function EditPayslipLineDialog({ line, employeeNumber, payRunId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(line.amount));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const category = line.pay_items?.category;

  async function loadOpenPayslip() {
    const { data: payslip, error } = await supabase
      .from("payslips")
      .select("id, gross_remuneration, finalised_at")
      .eq("employee_number", employeeNumber)
      .eq("pay_run_id", payRunId)
      .maybeSingle();
    if (error || !payslip) {
      setFormError(error ? formatError(error) : "No payslip found for this employee in this pay run.");
      return null;
    }
    if (payslip.finalised_at) {
      setFormError("This payslip is finalised. Unfinalise it first.");
      return null;
    }
    return payslip;
  }

  async function recalc(payslipId) {
    const { data: run, error: runError } = await supabase
      .from("pay_runs")
      .select("period_end, pay_frequencies(name)")
      .eq("id", payRunId)
      .single();
    if (runError) {
      setFormError(formatError(runError));
      return;
    }
    await recalculatePayslip({
      payslipId,
      employeeNumber,
      payRunId,
      frequencyName: run.pay_frequencies?.name,
      periodEnd: run.period_end,
    });
  }

  async function handleSave() {
    setFormError("");
    const value = Number(amount);
    if (amount === "" || Number.isNaN(value) || value <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);

    const payslip = await loadOpenPayslip();
    if (!payslip) {
      setSubmitting(false);
      return;
    }

    const { error: lineError } = await supabase.from("payslip_lines").update({ amount: value }).eq("id", line.id);
    if (lineError) {
      setFormError(formatError(lineError));
      setSubmitting(false);
      return;
    }

    if (category === "income") {
      const newGross = Number(payslip.gross_remuneration ?? 0) - Number(line.amount) + value;
      const { error: grossError } = await supabase
        .from("payslips")
        .update({ gross_remuneration: newGross })
        .eq("id", payslip.id);
      if (grossError) {
        setFormError(formatError(grossError));
        setSubmitting(false);
        return;
      }
    }

    await recalc(payslip.id);
    setSubmitting(false);
    setOpen(false);
    onSaved?.();
  }

  async function handleDelete() {
    setFormError("");
    setSubmitting(true);

    const payslip = await loadOpenPayslip();
    if (!payslip) {
      setSubmitting(false);
      return;
    }

    const { error: deleteError } = await supabase.from("payslip_lines").delete().eq("id", line.id);
    if (deleteError) {
      setFormError(formatError(deleteError));
      setSubmitting(false);
      return;
    }

    if (category === "income") {
      const newGross = Number(payslip.gross_remuneration ?? 0) - Number(line.amount);
      const { error: grossError } = await supabase
        .from("payslips")
        .update({ gross_remuneration: newGross })
        .eq("id", payslip.id);
      if (grossError) {
        setFormError(formatError(grossError));
        setSubmitting(false);
        return;
      }
    }

    await recalc(payslip.id);
    setSubmitting(false);
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAmount(String(line.amount));
          setFormError("");
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {line.pay_items?.name ?? "line"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`edit_line_amount_${line.id}`}>Amount</Label>
            <Input
              id={`edit_line_amount_${line.id}`}
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
            {submitting ? "Working…" : "Delete"}
          </Button>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
