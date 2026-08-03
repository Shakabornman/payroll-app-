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

function formatError(error) {
  const base = `${error.code ?? ""} ${error.message}`.trim();
  if (error.code === "42501") {
    return `${base}. If this is a permission error, the client needs to run GRANT INSERT ON payroll.employee_regular_inputs TO authenticated; in Supabase.`;
  }
  return base;
}

// Regular Inputs are dated, recurring, employee-level facts (rate, in this
// case) - independent of any specific pay period. Per the established rule:
// a rate change is always a NEW row with a new effective_from; effective_to
// on the prior row is never set here ("current" = latest effective_from
// that's <= today). This is therefore always an INSERT, never an update of
// an existing row.
export function SetHourlyRateDialog({ employeeNumber, onSaved }) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function resetForm() {
    setRate("");
    setEffectiveFrom("");
    setFormError("");
  }

  async function handleSave() {
    setFormError("");
    const amount = Number(rate);
    if (rate === "" || Number.isNaN(amount) || amount < 0) {
      setFormError("Enter a non-negative rate.");
      return;
    }
    if (!effectiveFrom) {
      setFormError("Effective from date is required.");
      return;
    }
    setSubmitting(true);

    const { data: payItem, error: payItemError } = await supabase
      .from("pay_items")
      .select("id")
      .eq("code", "BASIC_HOURLY")
      .maybeSingle();
    if (payItemError || !payItem) {
      setFormError(payItemError ? formatError(payItemError) : "Could not find the Basic Hourly pay item.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("employee_regular_inputs").insert({
      employee_number: employeeNumber,
      pay_item_id: payItem.id,
      amount,
      effective_from: effectiveFrom,
      effective_to: null,
    });
    if (insertError) {
      setFormError(formatError(insertError));
      setSubmitting(false);
      return;
    }

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
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Set hourly rate</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Basic Hourly rate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rate">Rate</Label>
            <Input id="rate" type="number" step="0.01" min="0" value={rate} onChange={(event) => setRate(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="effective_from">Effective from</Label>
            <Input
              id="effective_from"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
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
