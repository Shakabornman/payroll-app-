"use client";

import { useEffect, useState } from "react";
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
    return `${base}. If this is a permission error, the client needs to run GRANT INSERT, UPDATE ON payroll.payslip_lines, payroll.payslips TO authenticated; in Supabase.`;
  }
  return base;
}

// One-off income or deduction on a single payslip (e.g. Extra Shift, Shift
// Deduction, Repayment of Advance, Garnishee). Income raises gross; deductions
// only lower nett. Statutory items (PAYE, UIF, SDL) are never added by hand -
// the calculator writes them.
export function AddPayslipLineDialog({ employeeNumber, payRunId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [payItems, setPayItems] = useState([]);
  const [payItemId, setPayItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase
      .from("pay_items")
      .select("id, name, code, category")
      .eq("is_active", true)
      .eq("input_type", "once_off")
      .in("category", ["income", "deduction"])
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          setFormError(formatError(error));
          return;
        }
        setPayItems(data ?? []);
        setPayItemId((current) => current || data?.[0]?.id || "");
      });
  }, [open]);

  function resetForm() {
    setPayItemId("");
    setAmount("");
    setFormError("");
  }

  async function handleSave() {
    setFormError("");
    const value = Number(amount);
    if (amount === "" || Number.isNaN(value) || value <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (!payItemId) {
      setFormError("Choose an item.");
      return;
    }
    setSubmitting(true);

    const item = payItems.find((p) => p.id === payItemId);

    const { data: payslip, error: payslipError } = await supabase
      .from("payslips")
      .select("id, gross_remuneration, finalised_at")
      .eq("employee_number", employeeNumber)
      .eq("pay_run_id", payRunId)
      .maybeSingle();
    if (payslipError || !payslip) {
      setFormError(payslipError ? formatError(payslipError) : "No payslip found for this employee in this pay run.");
      setSubmitting(false);
      return;
    }
    if (payslip.finalised_at) {
      setFormError("This payslip is finalised. Unfinalise the pay run first.");
      setSubmitting(false);
      return;
    }

    const { data: run, error: runError } = await supabase
      .from("pay_runs")
      .select("period_end, pay_frequencies(name)")
      .eq("id", payRunId)
      .single();
    if (runError) {
      setFormError(formatError(runError));
      setSubmitting(false);
      return;
    }

    const { error: lineError } = await supabase.from("payslip_lines").insert({
      pay_run_id: payRunId,
      employee_number: employeeNumber,
      pay_item_id: payItemId,
      amount: value,
    });
    if (lineError) {
      setFormError(formatError(lineError));
      setSubmitting(false);
      return;
    }

    if (item?.category === "income") {
      const newGross = Number(payslip.gross_remuneration ?? 0) + value;
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

    await recalculatePayslip({
      payslipId: payslip.id,
      employeeNumber,
      payRunId,
      frequencyName: run.pay_frequencies?.name,
      periodEnd: run.period_end,
    });

    setSubmitting(false);
    setOpen(false);
    resetForm();
    onSaved?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Add income / deduction</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add income or deduction</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="line_item">Item</Label>
            <select
              id="line_item"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={payItemId}
              onChange={(event) => setPayItemId(event.target.value)}
            >
              {payItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.category})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="line_amount">Amount</Label>
            <Input
              id="line_amount"
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
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
