"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
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

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatError(error) {
  const base = `${error.code ?? ""} ${error.message}`.trim();
  if (error.code === "42501") {
    return `${base}. If this is a permission error, the client needs to run GRANT UPDATE ON payroll.employee_regular_inputs TO authenticated; in Supabase.`;
  }
  return base;
}

// A Regular input is a standing fact that carries into every future pay run,
// which is exactly why employee_regular_inputs is insert-only everywhere
// else (see add-regular-input-dialog.jsx, set-hourly-rate-dialog.jsx): once a
// payslip exists for a period this row covers, changing the row in place
// would silently rewrite what that payslip should show next time anyone
// recalculates (hourly-hours-list.jsx's reconcile, or Recalculate payslips).
// So editing is only ever allowed here when NOTHING has used this row yet -
// checked fresh on open, not assumed from how old the row looks. Once
// something has used it, the only correct fix is a new row with a later
// effective date (the existing Add dialogs), not an edit of this one.
export function EditRegularInputDialog({ row, employeeNumber, onSaved }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [blockedBy, setBlockedBy] = useState(null);
  const [amount, setAmount] = useState(String(row.amount));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function checkUsage() {
    setChecking(true);
    setFormError("");
    setBlockedBy(null);

    let runsQuery = supabase.from("pay_runs").select("id, period_start, period_end").gte("period_end", row.effective_from);
    if (row.effective_to) runsQuery = runsQuery.lte("period_start", row.effective_to);
    const { data: runs, error: runsError } = await runsQuery;
    if (runsError) {
      setFormError(formatError(runsError));
      setChecking(false);
      return;
    }

    if ((runs ?? []).length === 0) {
      setChecking(false);
      return;
    }

    const runIds = runs.map((r) => r.id);
    const { data: slips, error: slipsError } = await supabase
      .from("payslips")
      .select("pay_run_id")
      .eq("employee_number", employeeNumber)
      .in("pay_run_id", runIds);
    if (slipsError) {
      setFormError(formatError(slipsError));
      setChecking(false);
      return;
    }

    if ((slips ?? []).length > 0) {
      const usedRunIds = new Set(slips.map((s) => s.pay_run_id));
      const earliest = runs
        .filter((r) => usedRunIds.has(r.id))
        .sort((a, b) => a.period_start.localeCompare(b.period_start))[0];
      setBlockedBy(earliest);
    }
    setChecking(false);
  }

  async function handleSave() {
    setFormError("");
    const value = Number(amount);
    if (amount === "" || Number.isNaN(value) || value < 0) {
      setFormError("Enter a non-negative amount.");
      return;
    }
    setSubmitting(true);

    const { error } = await supabase.from("employee_regular_inputs").update({ amount: value }).eq("id", row.id);
    if (error) {
      setFormError(formatError(error));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) checkUsage();
        else {
          setAmount(String(row.amount));
          setFormError("");
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {row.pay_items?.name ?? "entry"}</DialogTitle>
        </DialogHeader>

        {checking && <p className="text-sm text-muted-foreground">Checking whether this entry is already in use…</p>}

        {!checking && blockedBy && (
          <p className="text-sm text-muted-foreground">
            This entry already applies to the pay run covering {formatDate(blockedBy.period_start)} –{" "}
            {formatDate(blockedBy.period_end)}. To change the amount, add a new entry effective from a later date
            instead of editing this one.
          </p>
        )}

        {!checking && !blockedBy && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`edit_regular_amount_${row.id}`}>Amount</Label>
              <Input
                id={`edit_regular_amount_${row.id}`}
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
        )}

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          {!checking && !blockedBy && (
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
