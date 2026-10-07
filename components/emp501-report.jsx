"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 });
}

// Tax year runs 1 March to end of February, named by the year it ends
// (handoff §4.1): transaction year 2026 = 1 Mar 2025 to 28 Feb 2026.
// Each month is the EMP201 rule (pay_date in the month, all frequencies),
// so the twelve rows reconcile to the monthly EMP201s.
function monthRange(taxYear) {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const year = i < 10 ? taxYear - 1 : taxYear;
    const month = ((i + 2) % 12) + 1;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const last = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    months.push({ key: `${year}-${String(month).padStart(2, "0")}`, start, end });
  }
  return months;
}

export function Emp501Report() {
  const [taxYear, setTaxYear] = useState("2026");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    setError("");
    setRows(null);
    const year = Number(taxYear);
    if (!Number.isInteger(year) || year < 2000) {
      setError("Enter a valid transaction year, for example 2026.");
      return;
    }
    setBusy(true);

    const months = monthRange(year);
    const { data: runs, error: runsError } = await supabase
      .from("pay_runs")
      .select("id, pay_date")
      .gte("pay_date", months[0].start)
      .lte("pay_date", months[11].end);
    if (runsError) {
      setError(`${runsError.code ?? ""} ${runsError.message}`.trim());
      setBusy(false);
      return;
    }

    const monthByRunId = new Map();
    for (const run of runs ?? []) monthByRunId.set(run.id, String(run.pay_date).slice(0, 7));

    let lines = [];
    const runIds = [...monthByRunId.keys()];
    if (runIds.length > 0) {
      const { data, error: linesError } = await supabase
        .from("payslip_lines")
        .select("pay_run_id, amount, pay_items(code)")
        .in("pay_run_id", runIds);
      if (linesError) {
        setError(`${linesError.code ?? ""} ${linesError.message}`.trim());
        setBusy(false);
        return;
      }
      lines = data ?? [];
    }

    const sums = new Map(months.map((m) => [m.key, { paye: 0, sdl: 0, uif: 0 }]));
    for (const line of lines) {
      const key = monthByRunId.get(line.pay_run_id);
      const bucket = sums.get(key);
      if (!bucket) continue;
      const code = line.pay_items?.code;
      const amount = Number(line.amount);
      if (code === "PAYE") bucket.paye += amount;
      else if (code === "SDL_ER") bucket.sdl += amount;
      else if (code === "UIF_EE" || code === "UIF_ER") bucket.uif += amount;
    }

    setRows(
      months.map((m) => {
        const s = sums.get(m.key);
        return { key: m.key, ...s, total: s.paye + s.sdl + s.uif };
      })
    );
    await logAudit({ action: "report_generated", entity: "emp501", entityId: taxYear, details: { transactionYear: year } });
    setBusy(false);
  }

  const totals = rows?.reduce(
    (acc, r) => ({ paye: acc.paye + r.paye, sdl: acc.sdl + r.sdl, uif: acc.uif + r.uif, total: acc.total + r.total }),
    { paye: 0, sdl: 0, uif: 0, total: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="emp501_year">Transaction year</Label>
          <Input
            id="emp501_year"
            type="number"
            value={taxYear}
            onChange={(event) => setTaxYear(event.target.value)}
            className="max-w-[10rem]"
          />
        </div>
        <Button onClick={handleRun} disabled={busy}>
          {busy ? "Calculating…" : "Generate EMP501"}
        </Button>
        {rows && (
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        )}
      </div>

      {error && <p className="print:hidden text-sm text-destructive">{error}</p>}

      {rows && (
        <div className="space-y-4 rounded-lg border p-6">
          <div className="text-center">
            <p className="text-lg font-semibold">EMP501 Financial Particulars - Hospital AT Ekhaya</p>
            <p className="text-sm">Transaction year {taxYear} · Period of reconciliation {taxYear}02</p>
            <div className="mt-2">
              <Badge variant="warning">DRAFT</Badge>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">SDL</TableHead>
                <TableHead className="text-right">UIF</TableHead>
                <TableHead className="text-right">Total liability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.key}</TableCell>
                  <TableCell className="text-right">R {formatMoney(r.paye)}</TableCell>
                  <TableCell className="text-right">R {formatMoney(r.sdl)}</TableCell>
                  <TableCell className="text-right">R {formatMoney(r.uif)}</TableCell>
                  <TableCell className="text-right">R {formatMoney(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Year total</TableCell>
                <TableCell className="text-right font-semibold">R {formatMoney(totals.paye)}</TableCell>
                <TableCell className="text-right font-semibold">R {formatMoney(totals.sdl)}</TableCell>
                <TableCell className="text-right font-semibold">R {formatMoney(totals.uif)}</TableCell>
                <TableCell className="text-right font-semibold">R {formatMoney(totals.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="print:hidden text-xs text-muted-foreground">
            ETI is dormant at HAE, so ETI columns are zero. Months after the last imported period are only as good as the live calculations.
          </p>
        </div>
      )}
    </div>
  );
}
