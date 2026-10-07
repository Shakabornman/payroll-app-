"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { PayslipRunList } from "@/components/payslip-run-list";
import { EmployeePayslipDetail } from "@/components/employee-payslip-detail";
import { PostPayRunDialog } from "@/components/post-pay-run-dialog";
import { BulkFinaliseDialog } from "@/components/bulk-finalise-dialog";
import { UnfinalisePayRunDialog } from "@/components/unfinalise-pay-run-dialog";
import { UnfinalisePayslipsDialog } from "@/components/unfinalise-payslips-dialog";
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
                <TableHead>Captured</TableHead>
                <TableHead>Finalised</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const c = counts.get(run.id) ?? { total: 0, finalised: 0, captured: 0 };
                const pending = c.total - c.finalised;
                return (
                  <TableRow key={run.id}>
                    <TableCell>{payRunLabel(run)}</TableCell>
                    <TableCell>{formatDate(run.pay_date)}</TableCell>
                    <TableCell>{c.total}</TableCell>
                    <TableCell>
                      {c.captured < c.total ? (
                        <Badge variant="outline">{c.captured} / {c.total}</Badge>
                      ) : (
                        c.captured
                      )}
                    </TableCell>
                    <TableCell>{c.finalised}</TableCell>
                    <TableCell>
                      {pending > 0 ? <Badge variant="warning">{pending}</Badge> : pending}
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

// Two Weekly is the only hourly frequency (same "two weekly" substring match
// used throughout the app - see lib/pay-run-periods.js, hourly-hours-list.jsx).
// Monthly frequencies (Pay Run 15, Month End) are salaried - nothing to
// capture, so their payslips should always count as ready regardless of
// normal_hours.
function isHourlyFrequency(frequencyName) {
  return (frequencyName ?? "").toLowerCase().includes("two weekly");
}

function PayslipsContent() {
  const [payRuns, setPayRuns] = useState(null);
  const [payslips, setPayslips] = useState(null);
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

  const fetchPayslips = useCallback(() => {
    // Raw per-payslip rows, not pre-reduced into counts - counts need each
    // row's pay run frequency too (see isHourlyFrequency), which only
    // `payRuns` knows, so the reduction happens in the counts useMemo below
    // once both queries have landed. Best-effort: a failure here shouldn't
    // block the page, the run list still works without the count columns.
    supabase
      .from("payslips")
      .select("pay_run_id, finalised_at, normal_hours")
      .then(({ data, error }) => {
        if (error) return;
        setPayslips(data ?? []);
      });
  }, []);

  useEffect(() => {
    fetchPayRuns();
    fetchPayslips();
  }, [fetchPayRuns, fetchPayslips]);

  // Total/Captured/Finalised counts per pay run. Client-side, not a DB view,
  // since volumes here are small (a few hundred payslips total).
  const counts = useMemo(() => {
    const map = new Map();
    if (!payRuns || !payslips) return map;
    const frequencyByRunId = new Map(payRuns.map((run) => [run.id, run.pay_frequencies?.name]));
    for (const row of payslips) {
      const entry = map.get(row.pay_run_id) ?? { total: 0, finalised: 0, captured: 0 };
      entry.total += 1;
      if (row.finalised_at) entry.finalised += 1;
      // Client-confirmed rule (2026-09-02): 0 hours only means "worked
      // nothing" once finalised - before that it's indistinguishable from
      // "not captured yet" (the seeded default), so it doesn't count toward
      // Captured. Salaried payslips (Pay Run 15 / Month End) have nothing to
      // capture, so they always count - keyed off the pay run's frequency
      // (2026-10-04 fix), not normal_hours === null: old imported salaried
      // payslips store normal_hours as 0.00 rather than null, so checking
      // the value alone misread them as "not captured" even though there
      // was never anything to capture. Finalising with 0 is still allowed
      // and correctable later via unfinalise - this count is purely a
      // pre-finalisation audit aid, not a gate.
      const frequencyName = frequencyByRunId.get(row.pay_run_id);
      const captured = row.finalised_at || !isHourlyFrequency(frequencyName) || Number(row.normal_hours) !== 0;
      if (captured) entry.captured += 1;
      map.set(row.pay_run_id, entry);
    }
    return map;
  }, [payRuns, payslips]);

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
          <Badge variant={selectedRun.status === "finalised" ? "success" : "warning"}>
            {selectedRun.status === "finalised" ? "Finalised" : "Draft"}
          </Badge>



          {selectedRun.status === "finalised" && (
            <UnfinalisePayRunDialog
              payRun={selectedRun}
              onUnfinalised={() => {
                fetchPayRuns();
              }}
            />
          )}
          {selectedRun.status !== "finalised" && (
            <BulkFinaliseDialog
              payRunId={selectedRun.id}
              onFinalised={() => {
                fetchPayslips();
              }}
            />
          )}
          {selectedRun.status !== "finalised" && finalisedCount !== null && finalisedCount > 0 && (
            <UnfinalisePayslipsDialog
              payRunId={selectedRun.id}
              onUnfinalised={() => {
                fetchPayslips();
              }}
            />
          )}
          {selectedRun.status !== "finalised" && finalisedCount !== null && finalisedCount > 0 && (
            <PostPayRunDialog
              currentRun={selectedRun}
              onPosted={(newRunId) => {
                fetchPayRuns();
                fetchPayslips();
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
