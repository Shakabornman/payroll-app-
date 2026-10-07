"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { HourlyHoursList } from "@/components/hourly-hours-list";
import { EmployeePayslipDetail } from "@/components/employee-payslip-detail";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function payRunLabel(payRun) {
  return `${formatDate(payRun.period_start)} – ${formatDate(payRun.period_end)}`;
}

function HoursContent() {
  const [payRuns, setPayRuns] = useState(null);
  const [payRunId, setPayRunId] = useState(null);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Hours only apply to hourly ("Two Weekly") staff - the other two
  // frequencies are fixed-salary and never carry normal_hours/normal_rate,
  // so this screen only ever needs Two Weekly pay runs, not the full list.
  //
  // This screen is hours-capture ONLY. Creating/posting/finalising a pay run
  // is not an hourly-specific concern - it's handled uniformly for every
  // frequency on Payslip Processing (see app/payslips/page.js), matching
  // real SimplePay's structure: Pay Runs is one place across all
  // frequencies, separate from per-employee/per-type capture screens. An
  // earlier version of this page had Post/Finalise bolted on here, which was
  // the wrong place for it - Two Weekly is not special in that regard.
  useEffect(() => {
    supabase
      .from("pay_runs")
      .select("id, period_start, period_end, pay_date, status, pay_frequencies!inner(name)")
      .ilike("pay_frequencies.name", "%two weekly%")
      .order("period_start", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(`${error.code ?? ""} ${error.message}`.trim());
          return;
        }
        setPayRuns(data ?? []);
      });
  }, []);

  const selectedRun = payRuns?.find((run) => run.id === payRunId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Hours & timesheet reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Hourly (&quot;Two Weekly&quot;) staff only. Historical data currently loaded through September 2025 only — nothing after that date is reflected yet.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Failed to load pay runs: {error}. If this is a permission error, the
          client needs to run{" "}
          <code className="font-mono">GRANT SELECT ON payroll.pay_runs TO authenticated;</code>{" "}
          and{" "}
          <code className="font-mono">GRANT SELECT ON payroll.pay_frequencies TO authenticated;</code>{" "}
          in Supabase.
        </p>
      )}

      {!error && payRuns === null && (
        <p className="text-sm text-muted-foreground">Loading pay runs…</p>
      )}

      {!error && payRuns?.length === 0 && (
        <p className="text-sm text-muted-foreground">No Two Weekly pay runs recorded yet.</p>
      )}

      {!error && payRuns && payRuns.length > 0 && !selectedRun && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Pay date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payRuns.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{payRunLabel(run)}</TableCell>
                <TableCell>{formatDate(run.pay_date)}</TableCell>
                <TableCell>
                  <Badge variant={run.status === "finalised" ? "success" : "warning"}>
                    {run.status === "finalised" ? "Finalised" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPayRunId(run.id);
                      setSelectedEmployee(null);
                    }}
                  >
                    Select
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selectedRun && !selectedEmployee && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPayRunId(null);
                setSelectedEmployee(null);
              }}
            >
              ← Change pay run
            </Button>
            <span className="text-sm font-medium">{payRunLabel(selectedRun)}</span>
            <span className="text-sm text-muted-foreground">
              Pay date {formatDate(selectedRun.pay_date)}
            </span>
            <Badge variant={selectedRun.status === "finalised" ? "success" : "warning"}>
              {selectedRun.status === "finalised" ? "Finalised" : "Draft"}
            </Badge>
          </div>
          <HourlyHoursList
            payRunId={selectedRun.id}
            periodStart={selectedRun.period_start}
            periodEnd={selectedRun.period_end}
            editable={selectedRun.status !== "finalised"}
            onSelectEmployee={setSelectedEmployee}
          />
        </div>
      )}

      {selectedRun && selectedEmployee && (
        <div>
          <Button variant="outline" size="sm" className="mb-3" onClick={() => setSelectedEmployee(null)}>
            ← Back to pay run
          </Button>
          <EmployeePayslipDetail employee={selectedEmployee} payRunId={selectedRun.id} />
        </div>
      )}
    </div>
  );
}

export default function HoursPage() {
  return (
    <ProtectedRoute>
      <HoursContent />
    </ProtectedRoute>
  );
}
