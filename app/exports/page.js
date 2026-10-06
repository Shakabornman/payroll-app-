"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { supabase } from "@/lib/supabase";
import { PayRunExportButton } from "@/components/pay-run-export-button";
import { PayRunXeroExportButton } from "@/components/pay-run-xero-export-button";
import { PayRunEftExportButton } from "@/components/pay-run-eft-export-button";
import { BatchPayslipPrint } from "@/components/batch-payslip-print";

function shortFrequency(name) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("month end")) return "Month End";
  if (n.includes("pay run 15")) return "Pay Run 15";
  if (n.includes("two weekly")) return "Two Weekly";
  return name ?? "Pay run";
}

function formatDay(value) {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function ExportsContent() {
  const [runs, setRuns] = useState(null);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pay_runs")
      .select("id, period_start, period_end, pay_date, status, pay_frequency_id, pay_frequencies(name)")
      .order("period_start", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          setError(`${loadError.code ?? ""} ${loadError.message}`.trim());
          return;
        }
        setRuns(data ?? []);
        setRunId((current) => current || data?.[0]?.id || "");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = runs?.find((r) => r.id === runId);
  const periodLabel = run ? `${run.period_start}_to_${run.period_end}` : "";

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Exports</h1>
        <p className="text-sm text-muted-foreground">
          Pick a pay run at the top. It applies to every export below. Every export is recorded in the audit trail.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {runs === null && !error && <p className="text-sm text-muted-foreground">Loading pay runs…</p>}
      {runs && runs.length === 0 && <p className="text-sm text-muted-foreground">No pay runs recorded yet.</p>}

      {run && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="export_run" className="text-sm font-medium">
              Pay run
            </label>
            <select
              id="export_run"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {shortFrequency(r.pay_frequencies?.name)}, {formatDay(r.period_start)} to {formatDay(r.period_end)}
                  {r.status === "finalised" ? " (posted)" : " (draft)"}
                </option>
              ))}
            </select>
          </div>

          <div className="divide-y rounded-lg border">
            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">Pay run CSV</p>
                <p className="text-sm text-muted-foreground">One row per payslip, all figures.</p>
              </div>
              <PayRunExportButton payRunId={run.id} periodLabel={periodLabel} />
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">Xero journal</p>
                <p className="text-sm text-muted-foreground">One journal for the pay run. Must balance before it downloads.</p>
              </div>
              <PayRunXeroExportButton
                payRunId={run.id}
                payDate={run.pay_date}
                frequencyName={run.pay_frequencies?.name}
                periodLabel={periodLabel}
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">ABSA EFT file</p>
                <p className="text-sm text-muted-foreground">Payments for EFT staff with a positive nett pay.</p>
              </div>
              <PayRunEftExportButton payRunId={run.id} periodLabel={periodLabel} />
            </div>
          </div>
        </>
      )}

      {run && (
        <div className="space-y-3">
          <div>
            <p className="font-medium">Batch payslips</p>
            <p className="text-sm text-muted-foreground">Every payslip in the chosen pay run, one per page.</p>
          </div>
          <BatchPayslipPrint payRunId={run.id} posted={run.status === "finalised"} />
        </div>
      )}
    </div>
  );
}

export default function ExportsPage() {
  return (
    <ProtectedRoute>
      <ExportsContent />
    </ProtectedRoute>
  );
}
