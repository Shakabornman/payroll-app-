"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
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

// Real SimplePay's Bulk Finalisation screen lists every payslip actually in
// the run (Name | Number | Nett Pay), not a company-wide search - matching
// that here rather than reusing EmployeeSelector's whole-company list, since
// this view is specifically about reconciling *this* pay run's payslips.
// Named must-fix from hae-simplepay-design-reference (Screens 25-30): names
// must link straight into the payslip, not require separate navigation.
export function PayslipRunList({ payRunId, onSelectEmployee }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRows(null);
      setError("");

      const { data: payslips, error: payslipsError } = await supabase
        .from("payslips")
        .select("employee_number, nett_pay, finalised_at")
        .eq("pay_run_id", payRunId);

      if (cancelled) return;

      if (payslipsError) {
        setError(`${payslipsError.code ?? ""} ${payslipsError.message}`.trim());
        return;
      }

      const employeeNumbers = [...new Set((payslips ?? []).map((p) => p.employee_number))];
      if (employeeNumbers.length === 0) {
        setRows([]);
        return;
      }

      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("employee_number, full_name, job_title")
        .in("employee_number", employeeNumbers);

      if (cancelled) return;

      if (employeesError) {
        setError(`${employeesError.code ?? ""} ${employeesError.message}`.trim());
        return;
      }

      const byNumber = new Map((employees ?? []).map((e) => [e.employee_number, e]));
      const merged = (payslips ?? [])
        .map((p) => ({
          ...p,
          full_name: byNumber.get(p.employee_number)?.full_name ?? p.employee_number,
          job_title: byNumber.get(p.employee_number)?.job_title,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      setRows(merged);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [payRunId]);

  if (error) {
    return <p className="text-sm text-destructive">Failed to load payslips: {error}</p>;
  }

  if (rows === null) {
    return <p className="text-sm text-muted-foreground">Loading payslips…</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No payslips captured for this pay run yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Employee #</TableHead>
          <TableHead>Job title</TableHead>
          <TableHead>Nett pay</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.employee_number}>
            <TableCell>
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() =>
                  onSelectEmployee({
                    employee_number: row.employee_number,
                    full_name: row.full_name,
                    job_title: row.job_title,
                  })
                }
              >
                {row.full_name}
              </button>
            </TableCell>
            <TableCell>{row.employee_number}</TableCell>
            <TableCell>{row.job_title ?? "—"}</TableCell>
            <TableCell>{formatMoney(row.nett_pay)}</TableCell>
            <TableCell>
              <Badge variant={row.finalised_at ? "default" : "secondary"}>
                {row.finalised_at ? "Finalised" : "Pending"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
