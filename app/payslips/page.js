"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { PayslipRunList } from "@/components/payslip-run-list";
import { EmployeePayslipDetail } from "@/components/employee-payslip-detail";
import { PostPayRunDialog } from "@/components/post-pay-run-dialog";
import { BulkFinaliseDialog } from "@/components/bulk-finalise-dialog";
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

// Real SimplePay groups pay runs by frequency on both the Employee List and
// Pay Runs screens (see hae-simplepay-design-reference memory) - matching
// that here rather than a flat dropdown, since it's a validated real pattern.
function groupByFrequency(payRuns) {
  const groups = new Map();
  for (const run of payRuns) {
    const name = run.pay_frequencies?.name ?? "Unknown frequency";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(run);
  }
  return groups;
}

function PayRunsOverview({ payRuns, counts, onSelect }) {
  const groups = groupByFrequency(payRuns);

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([frequencyName, runs]) => (
        <div key={frequencyName}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{frequencyName}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Pay date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Finalised</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const c = counts.get(run.id) ?? { total: 0, finalised: 0 };
                const pending = c.total - c.finalised;
                return (
                  <TableRow key={run.id}>
                    <TableCell>{payRunLabel(run)}</TableCell>
                    <TableCell>{formatDate(run.pay_date)}</TableCell>
                    <TableCell>{c.total}</TableCell>
                    <TableCell>{c.finalised}</TableCell>
                    <TableCell>
                      {pending > 0 ? <Badge variant="secondary">{pending}</Badge> : pending}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => onSelect(run.id)}>
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function PayslipsContent() {
  const [payRuns, setPayRuns] = useState(null);
  const [counts, setCounts] = useState(new Map());
  const [payRunId, setPayRunId] = useState(null);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Extracted as named functions (not just useEffect closures) so both can
  // be re-run after PostPayRunDialog creates the next period, or
  // BulkFinaliseDialog finalises payslips.
  const fetchPayRuns = useCallback(() => {
    supabase
      .from("pay_runs")
      .select("id, period_start, period_end, pay_date, status, pay_frequency_id, pay_frequencies(name)")
      .order("period_start", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(`${error.code ?? ""} ${error.message}`.trim());
          return;
        }
        setPayRuns(data ?? []);
      });
  }, []);

  const fetchCounts = useCallback(() => {
    // Total/Finalised counts per pay run - computed client-side from a single
    // lightweight query rather than a DB view, since volumes here are small
    // (a few hundred payslips total). Best-effort: a failure here shouldn't
    // block the page, the run list still works without the count columns.
    supabase
      .from("payslips")
      .select("pay_run_id, finalised_at")
      .then(({ data, error }) => {
        if (error) return;
        const map = new Map();
        for (const row of data ?? []) {
          const entry = map.get(row.pay_run_id) ?? { total: 0, finalised: 0 };
          entry.total += 1;
          if (row.finalised_at) entry.finalised += 1;
          map.set(row.pay_run_id, entry);
        }
        setCounts(map);
      });
  }, []);

  useEffect(() => {
    fetchPayRuns();
    fetchCounts();
  }, [fetchPayRuns, fetchCounts]);

  const selectedRun = payRuns?.find((run) => run.id === payRunId);

  // Real rule (client-confirmed): a pay run can't be posted until at least
  // one payslip in it has been finalised. Derived from `counts` (already
  // fetched above), not a separate query - plain derivation, not state.
  const finalisedCount = selectedRun ? counts.get(selectedRun.id)?.finalised ?? 0 : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Payslip processing</h1>
        <p className="text-sm text-muted-foreground">
          Historical data currently loaded through September 2025 only — nothing after that date is reflected yet.
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
        <p className="text-sm text-muted-foreground">No pay runs recorded yet.</p>
      )}

      {!error && payRuns && payRuns.length > 0 && !selectedRun && (
        <PayRunsOverview
          payRuns={payRuns}
          counts={counts}
          onSelect={(id) => {
            setPayRunId(id);
            setSelectedEmployee(null);
          }}
        />
      )}

      {selectedRun && (
        <div className="flex flex-wrap items-center gap-3">
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
          <span className="text-sm font-medium">
            {selectedRun.pay_frequencies?.name} — {payRunLabel(selectedRun)}
          </span>
          <span className="text-sm text-muted-foreground">
            Pay date {formatDate(selectedRun.pay_date)}
          </span>
          <Badge variant={selectedRun.status === "finalised" ? "default" : "secondary"}>
            {selectedRun.status === "finalised" ? "Finalised" : "Draft"}
          </Badge>
          {selectedRun.status !== "finalised" && (
            <BulkFinaliseDialog
              payRunId={selectedRun.id}
              onFinalised={() => {
                fetchCounts();
              }}
            />
          )}
          {selectedRun.status !== "finalised" && finalisedCount !== null && finalisedCount > 0 && (
            <PostPayRunDialog
              currentRun={selectedRun}
              onPosted={(newRunId) => {
                fetchPayRuns();
                fetchCounts();
                setPayRunId(newRunId);
              }}
            />
          )}
        </div>
      )}

      {selectedRun && selectedRun.status !== "finalised" && finalisedCount === 0 && (
        <p className="text-sm text-muted-foreground">
          Payslips need to be finalised before this pay run can be posted.
        </p>
      )}

      {selectedRun && !selectedEmployee && (
        <div>
          <h2 className="mb-3 text-lg font-medium">Payslips in this pay run</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Click a name to view their payslip detail for this pay run.
          </p>
          <PayslipRunList payRunId={selectedRun.id} onSelectEmployee={setSelectedEmployee} />
        </div>
      )}

      {selectedRun && selectedEmployee && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="mb-3"
            onClick={() => setSelectedEmployee(null)}
          >
            ← Back to pay run
          </Button>
          <EmployeePayslipDetail employee={selectedEmployee} payRunId={selectedRun.id} />
        </div>
      )}
    </div>
  );
}

export default function PayslipsPage() {
  return (
    <ProtectedRoute>
      <PayslipsContent />
    </ProtectedRoute>
  );
}
