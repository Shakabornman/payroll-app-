"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatMoney(value) {
  return `R ${Number(value ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

// Monthly EMP201 (SARS monthly employer declaration). Figures are summed over
// every pay run whose pay_date falls in the month, regardless of frequency -
// the same rule validated against the real September 2025 EMP201 (handoff
// §4.4, Appendix B3). Read-only; nothing is written.
export function Emp201Report() {
  const [month, setMonth] = useState("2025-09");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    setError("");
    setResult(null);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("Choose a month.");
      return;
    }
    setBusy(true);

    const [year, mon] = month.split("-").map(Number);
    const start = `${year}-${String(mon).padStart(2, "0")}-01`;
    const end = `${year}-${String(mon).padStart(2, "0")}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;

    const { data: runs, error: runsError } = await supabase
      .from("pay_runs")
      .select("id")
      .gte("pay_date", start)
      .lte("pay_date", end);
    if (runsError) {
      setError(`${runsError.code ?? ""} ${runsError.message}`.trim());
      setBusy(false);
      return;
    }

    const runIds = (runs ?? []).map((r) => r.id);
    let lines = [];
    if (runIds.length > 0) {
      const { data, error: linesError } = await supabase
        .from("payslip_lines")
        .select("amount, pay_items(code)")
        .in("pay_run_id", runIds);
      if (linesError) {
        setError(`${linesError.code ?? ""} ${linesError.message}`.trim());
        setBusy(false);
        return;
      }
      lines = data ?? [];
    }

    const sumFor = (codes) =>
      lines.filter((l) => codes.includes(l.pay_items?.code)).reduce((sum, l) => sum + Number(l.amount), 0);

    const paye = sumFor(["PAYE"]);
    const sdl = sumFor(["SDL_ER"]);
    const uif = sumFor(["UIF_EE", "UIF_ER"]);
    const payroll = paye + sdl + uif;

    setResult({ start, end, paye, sdl, uif, payroll, runCount: runIds.length });
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="emp201_month">Month</Label>
          <Input
            id="emp201_month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="max-w-[12rem]"
          />
        </div>
        <Button onClick={handleRun} disabled={busy}>
          {busy ? "Calculating…" : "Generate EMP201"}
        </Button>
        {result && (
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        )}
      </div>

      {error && <p className="print:hidden text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4 rounded-lg border p-6">
          <div className="text-center">
            <p className="text-lg font-semibold">Hospital AT Ekhaya</p>
            <p className="text-xl font-semibold">EMP201</p>
            <p className="text-sm">
              Period: {formatDate(result.start)} to {formatDate(result.end)}
            </p>
            <div className="mt-2">
              <Badge variant="destructive">DRAFT</Badge>
            </div>
            <p className="print:hidden mt-2 text-xs text-muted-foreground">
              {result.runCount} pay run{result.runCount === 1 ? "" : "s"} with a pay date in this month
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Liability</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>PAYE</TableCell>
                <TableCell className="text-right">{formatMoney(result.paye)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>SDL</TableCell>
                <TableCell className="text-right">{formatMoney(result.sdl)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>UIF (employee + employer)</TableCell>
                <TableCell className="text-right">{formatMoney(result.uif)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Payroll liability</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(result.payroll)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>ETI (brought forward, calculated, utilised, carried forward)</TableCell>
                <TableCell className="text-right">{formatMoney(0)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">Total payable</TableCell>
                <TableCell className="text-right font-semibold">{formatMoney(result.payroll)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
