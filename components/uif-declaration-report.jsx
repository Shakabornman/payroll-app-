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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

// Reason codes per handoff §4.2 and Appendix B5. Contribution is taken from
// what was actually deducted on the period's payslips (historical fact), not
// from current classification. Codes 7 vs 8 and anything unclassified are
// shown as unresolved, not guessed.
function reasonFor(contributed, taxable, employee) {
  if (contributed > 0) return { code: "", text: "Contributing" };
  if (taxable === 0) return { code: "6", text: "No income this period" };
  const reason = employee.uif_exemption_reason ?? "";
  if (reason === "Works less than 24 hours per month") return { code: "1", text: reason };
  if (reason === "Earns commission only") return { code: "5", text: reason };
  if (reason === "Public Servant") return { code: "3", text: reason };
  if (/pension|superannuation/i.test(reason)) return { code: "7 or 8", text: "Unresolved: state vs employer pension" };
  if (/learner|foreign/i.test(reason)) return { code: "", text: "Invalid reason: this exemption no longer applies since 1 March 2018" };
  if (employee.uif_exempt) return { code: "", text: reason ? `Exempt: ${reason}` : "Exempt: reason not recorded" };
  return { code: "", text: "Not yet classified" };
}

export function UifDeclarationReport() {
  const [month, setMonth] = useState("2025-09");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    setError("");
    setRows(null);
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

    const [slipsRes, linesRes, empRes] = await Promise.all([
      runIds.length
        ? supabase.from("payslips").select("employee_number, gross_remuneration_taxable").in("pay_run_id", runIds)
        : Promise.resolve({ data: [], error: null }),
      runIds.length
        ? supabase.from("payslip_lines").select("employee_number, amount, pay_items(code)").in("pay_run_id", runIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("employees")
        .select("employee_number, full_name, id_number, employment_date, is_active, uif_exempt, uif_exemption_reason")
        .order("employee_number"),
    ]);
    const failed = [slipsRes, linesRes, empRes].find((r) => r.error);
    if (failed) {
      setError(`${failed.error.code ?? ""} ${failed.error.message}`.trim());
      setBusy(false);
      return;
    }

    const taxable = new Map();
    for (const slip of slipsRes.data ?? []) {
      taxable.set(slip.employee_number, (taxable.get(slip.employee_number) ?? 0) + Number(slip.gross_remuneration_taxable ?? 0));
    }
    const uif = new Map();
    for (const line of linesRes.data ?? []) {
      if (line.pay_items?.code !== "UIF_EE") continue;
      uif.set(line.employee_number, (uif.get(line.employee_number) ?? 0) + Number(line.amount));
    }

    const result = (empRes.data ?? [])
      .filter((e) => taxable.has(e.employee_number) || uif.has(e.employee_number))
      .map((e) => {
        const t = taxable.get(e.employee_number) ?? 0;
        const u = uif.get(e.employee_number) ?? 0;
        return { ...e, taxable: t, uif: u, ...reasonFor(u, t, e) };
      });

    setRows(result);
    await logAudit({ action: "report_generated", entity: "uif_declaration", entityId: month, details: { month, employees: result.length } });
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="uif_month">Month</Label>
          <Input
            id="uif_month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="max-w-[12rem]"
          />
        </div>
        <Button onClick={handleRun} disabled={busy}>
          {busy ? "Calculating…" : "Generate UIF Declaration"}
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
            <p className="text-lg font-semibold">UIF Declaration - Hospital AT Ekhaya</p>
            <p className="text-sm">Period: {month}</p>
            <div className="mt-2">
              <Badge variant="destructive">DRAFT</Badge>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Employee #</TableHead>
                <TableHead>ID number</TableHead>
                <TableHead>Employed from</TableHead>
                <TableHead className="text-right">Gross taxable</TableHead>
                <TableHead className="text-right">UIF</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status or reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employee_number}>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell>{r.employee_number}</TableCell>
                  <TableCell>{r.id_number ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.employment_date)}</TableCell>
                  <TableCell className="text-right">R {formatMoney(r.taxable)}</TableCell>
                  <TableCell className="text-right">R {formatMoney(r.uif)}</TableCell>
                  <TableCell>{r.code}</TableCell>
                  <TableCell>{r.text}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="print:hidden text-xs text-muted-foreground">
            Rows marked unresolved or not yet classified need HR input before this declaration is filed.
          </p>
        </div>
      )}
    </div>
  );
}
