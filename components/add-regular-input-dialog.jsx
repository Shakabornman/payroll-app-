"use client";

import { useEffect, useState } from "react";
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

// Recurring pay items only (e.g. Basic Salary) - hourly rates keep their own
// dialog (SetHourlyRateDialog) since they're rate_times_quantity, not a fixed
// amount per period. Same insert-only rule as SetHourlyRateDialog: a change is
// always a NEW row with a new effective_from, never an edit of an existing row.
export function AddRegularInputDialog({ employeeNumber, onSaved }) {
  const [open, setOpen] = useState(false);
  const [payItems, setPayItems] = useState([]);
  const [payItemId, setPayItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase
      .from("pay_items")
      .select("id, name")
      .eq("input_type", "recurring")
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
    setEffectiveFrom("");
    setFormError("");
  }

  async function handleSave() {
    setFormError("");
    const value = Number(amount);
    if (amount === "" || Number.isNaN(value) || value < 0) {
      setFormError("Enter a non-negative amount.");
      return;
    }
    if (!payItemId) {
      setFormError("Choose a pay item.");
      return;
    }
    if (!effectiveFrom) {
      setFormError("Effective from date is required.");
      return;
    }
    setSubmitting(true);

    const { error } = await supabase.from("employee_regular_inputs").insert({
      employee_number: employeeNumber,
      pay_item_id: payItemId,
      amount: value,
      effective_from: effectiveFrom,
      effective_to: null,
    });
    if (error) {
      setFormError(formatError(error));
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
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Add regular input</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add regular input</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pay_item">Pay item</Label>
            <select
              id="pay_item"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={payItemId}
              onChange={(event) => setPayItemId(event.target.value)}
            >
              {payItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amount">Amount per period</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="effective_from_regular">Effective from</Label>
            <Input
              id="effective_from_regular"
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
