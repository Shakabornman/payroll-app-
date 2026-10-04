"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function formatError(error) {
  const base = `${error.code ?? ""} ${error.message}`.trim();
  if (error.code === "42501") {
    return `${base}. If this is a permission error, the client needs to run GRANT UPDATE ON payroll.payslips TO authenticated; in Supabase.`;
  }
  return base;
}

// Mirrors BulkFinaliseDialog - same shape, reversed: lists already-finalised
// payslips in this run and clears finalised_at on the ones picked. Only
// ever rendered by PayslipsContent while the pay run itself is still draft
// (see UnfinalisePayRunDialog's file comment for why a payslip can't be
// unfinalised under a still-finalised/posted run).
export function UnfinalisePayslipsDialog({ payRunId, onUnfinalised }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadRows() {
    setRows(null);
    setLoadError("");
    setSelected(new Set());

    const { data: payslips, error: payslipsError } = await supabase
      .from("payslips")
      .select("id, employee_number, normal_hours, gross_remuneration, finalised_at")
      .eq("pay_run_id", payRunId)
      .not("finalised_at", "is", null);

    if (payslipsError) {
      setLoadError(formatError(payslipsError));
      return;
    }

    if (!payslips || payslips.length === 0) {
      setRows([]);
      return;
    }

    const employeeNumbers = payslips.map((p) => p.employee_number);
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("employee_number, full_name")
      .in("employee_number", employeeNumbers);

    if (employeesError) {
      setLoadError(formatError(employeesError));
      return;
    }

    const byEmployee = new Map((employees ?? []).map((e) => [e.employee_number, e]));
    const merged = payslips
      .map((p) => ({ ...p, full_name: byEmployee.get(p.employee_number)?.full_name ?? p.employee_number }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    setRows(merged);
  }

  function toggleRow(payslipId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(payslipId)) {
        next.delete(payslipId);
      } else {
        next.add(payslipId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (!rows) return;
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function handleUnfinalise() {
    setFormError("");
    if (selected.size === 0) {
      setFormError("Select at least one payslip to unfinalise.");
      return;
    }
    setSubmitting(true);

    const { error } = await supabase
      .from("payslips")
      .update({ finalised_at: null })
      .in("id", [...selected]);

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
        if (nextOpen) loadRows();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Unfinalise payslips</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalised payslips</DialogTitle>
        </DialogHeader>

        {loadError && <p className="text-sm text-destructive">Failed to load: {loadError}</p>}

        {!loadError && rows === null && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {!loadError && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No finalised payslips in this pay run yet.
          </p>
        )}

        {!loadError && rows && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox checked={selected.size === rows.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Employee #</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Gross pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleRow(row.id)} />
                  </TableCell>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell>{row.employee_number}</TableCell>
                  <TableCell>{formatHours(row.normal_hours)}</TableCell>
                  <TableCell>{formatMoney(row.gross_remuneration)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          {rows && rows.length > 0 && (
            <Button onClick={handleUnfinalise} disabled={submitting} variant="destructive">
              {submitting ? "Unfinalising…" : `Unfinalise ${selected.size > 0 ? `(${selected.size})` : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
