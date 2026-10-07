"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeePayslipDetail } from "@/components/employee-payslip-detail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value) {
  if (value === null || value === undefined) return "—";
  return `R ${Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

// Same detail layout as Payslip processing (EmployeePayslipDetail), reached
// from the Employees list: the employee's pay runs, newest first, and the
// chosen run's full payslip underneath - reused, not re-built.
export function EmployeeDetailView({ employee, onBack }) {
  const [runs, setRuns] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setRuns(null);
      setError("");

      const { data: payslips, error: payslipsError } = await supabase
        .from("payslips")
        .select("pay_run_id, gross_remuneration, nett_pay, finalised_at")
        .eq("employee_number", employee.employee_number);
      if (cancelled) return;
      if (payslipsError) {
        setError(`${payslipsError.code ?? ""} ${payslipsError.message}`.trim());
        return;
      }

      const runIds = (payslips ?? []).map((p) => p.pay_run_id);
      if (runIds.length === 0) {
        setRuns([]);
        return;
      }

      const { data: payRuns, error: runsError } = await supabase
        .from("pay_runs")
        .select("id, period_start, period_end, pay_date, status, pay_frequencies(name)")
        .in("id", runIds);
      if (cancelled) return;
      if (runsError) {
        setError(`${runsError.code ?? ""} ${runsError.message}`.trim());
        return;
      }

      const byRunId = new Map((payRuns ?? []).map((r) => [r.id, r]));
      const merged = (payslips ?? [])
        .map((p) => ({ ...p, run: byRunId.get(p.pay_run_id) }))
        .filter((p) => p.run)
        .sort((a, b) => b.run.period_start.localeCompare(a.run.period_start));

      setRuns(merged);
      setSelectedRunId((current) => current ?? merged[0]?.pay_run_id ?? null);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [employee.employee_number]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Back to employees
        </Button>
        <span className="text-lg font-medium">
          {employee.full_name} <span className="text-muted-foreground">#{employee.employee_number}</span>
        </span>
        <span className="text-sm text-muted-foreground">{employee.job_title ?? ""}</span>
      </div>

      {error && <p className="text-sm text-destructive">Failed to load pay runs: {error}</p>}

      {!error && runs === null && <p className="text-sm text-muted-foreground">Loading pay runs…</p>}

      {!error && runs?.length === 0 && (
        <p className="text-sm text-muted-foreground">No payslips for this employee yet.</p>
      )}

      {!error && runs && runs.length > 0 && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-medium">Pay runs</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Pay date</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Nett pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((row) => (
                  <TableRow key={row.pay_run_id} data-state={row.pay_run_id === selectedRunId ? "selected" : undefined}>
                    <TableCell>{row.run.pay_frequencies?.name ?? "—"}</TableCell>
                    <TableCell>
                      {formatDate(row.run.period_start)} – {formatDate(row.run.period_end)}
                    </TableCell>
                    <TableCell>{formatDate(row.run.pay_date)}</TableCell>
                    <TableCell>{formatMoney(row.gross_remuneration)}</TableCell>
                    <TableCell>{formatMoney(row.nett_pay)}</TableCell>
                    <TableCell>
                      <Badge variant={row.finalised_at ? "success" : "warning"}>
                        {row.finalised_at ? "Finalised" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={row.pay_run_id === selectedRunId ? "default" : "outline"}
                        onClick={() => setSelectedRunId(row.pay_run_id)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {selectedRunId && (
            <EmployeePayslipDetail
              key={selectedRunId}
              employee={{
                employee_number: employee.employee_number,
                full_name: employee.full_name,
                job_title: employee.job_title,
              }}
              payRunId={selectedRunId}
            />
          )}
        </>
      )}
    </div>
  );
}
