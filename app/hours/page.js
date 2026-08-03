"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { HourlyHoursList } from "@/components/hourly-hours-list";
import { PostPayRunDialog } from "@/components/post-pay-run-dialog";
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
  // Extracted as a named function (not just a useEffect closure) so it can
  // be re-run after PostPayRunDialog creates the next period.
  const fetchPayRuns = useCallback(() => {
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

  useEffect(() => {
    fetchPayRuns();
  }, [fetchPayRuns]);

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
                  <Badge variant={run.status === "finalised" ? "default" : "secondary"}>
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
            <Badge variant={selectedRun.status === "finalised" ? "default" : "secondary"}>
              {selectedRun.status === "finalised" ? "Finalised" : "Draft"}
            </Badge>
            {selectedRun.status !== "finalised" && (
              <PostPayRunDialog
                currentRun={selectedRun}
                onPosted={(newRunId) => {
                  fetchPayRuns();
                  setPayRunId(newRunId);
                }}
              />
            )}
          </div>
          <HourlyHoursList
            payRunId={selectedRun.id}
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
