"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

const CATEGORY_ORDER = { income: 1, deduction: 2, statutory: 3, employer_contribution: 4 };

function money(value) {
  return Number(value ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateText(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function isoDay(value) {
  return String(value).slice(0, 10);
}

// SA tax year starts 1 March (handoff §3.5): YTD runs from there to this pay date.
function taxYearStart(payDate) {
  const d = new Date(`${isoDay(payDate)}T00:00:00Z`);
  const year = d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${year}-03-01`;
}

function maskId(value) {
  const s = String(value ?? "").replace(/\.0$/, "");
  if (s.length < 4) return "—";
  return "X".repeat(s.length - 4) + s.slice(-4);
}

function maskAccount(value) {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  return "•".repeat(Math.max(0, s.length - 4)) + s.slice(-4);
}

function PayslipPrintContent() {
  const { runId, employee: employeeNumber } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [slipRes, empRes, runRes, linesRes] = await Promise.all([
        supabase
          .from("payslips")
          .select("gross_remuneration, gross_remuneration_taxable, nett_pay, cost_to_company, finalised_at")
          .eq("pay_run_id", runId)
          .eq("employee_number", employeeNumber)
          .maybeSingle(),
        supabase
          .from("employees")
          .select(
            "employee_number, full_name, job_title, employment_date, id_number, payment_method, banking_bank_name, banking_branch_code, banking_account_number, banking_account_type, residential_street_no, residential_street, residential_complex, residential_unit_number, residential_suburb, residential_city, residential_postal_code, pay_points(name)"
          )
          .eq("employee_number", employeeNumber)
          .maybeSingle(),
        supabase.from("pay_runs").select("id, period_start, period_end, pay_date").eq("id", runId).maybeSingle(),
        supabase
          .from("payslip_lines")
          .select("amount, pay_items(code, name, category)")
          .eq("pay_run_id", runId)
          .eq("employee_number", employeeNumber),
      ]);
      const failed = [slipRes, empRes, runRes, linesRes].find((r) => r.error);
      if (failed) {
        if (!cancelled) setError(`${failed.error.code ?? ""} ${failed.error.message}`.trim());
        return;
      }
      if (!slipRes.data || !empRes.data || !runRes.data) {
        if (!cancelled) setError("No payslip found for this employee in this pay run.");
        return;
      }

      const start = taxYearStart(runRes.data.pay_date);
      const { data: ytdRuns, error: ytdRunsError } = await supabase
        .from("pay_runs")
        .select("id")
        .gte("pay_date", start)
        .lte("pay_date", isoDay(runRes.data.pay_date));
      if (ytdRunsError) {
        if (!cancelled) setError(`${ytdRunsError.code ?? ""} ${ytdRunsError.message}`.trim());
        return;
      }
      const ytdRunIds = (ytdRuns ?? []).map((r) => r.id);

      let ytdLines = [];
      let ytdNett = 0;
      if (ytdRunIds.length > 0) {
        const [ytdLinesRes, ytdSlipsRes] = await Promise.all([
          supabase
            .from("payslip_lines")
            .select("amount, pay_items(code, category)")
            .eq("employee_number", employeeNumber)
            .in("pay_run_id", ytdRunIds),
          supabase
            .from("payslips")
            .select("nett_pay")
            .eq("employee_number", employeeNumber)
            .in("pay_run_id", ytdRunIds),
        ]);
        const ytdFailed = [ytdLinesRes, ytdSlipsRes].find((r) => r.error);
        if (ytdFailed) {
          if (!cancelled) setError(`${ytdFailed.error.code ?? ""} ${ytdFailed.error.message}`.trim());
          return;
        }
        ytdLines = ytdLinesRes.data ?? [];
        ytdNett = (ytdSlipsRes.data ?? []).reduce((s, p) => s + Number(p.nett_pay ?? 0), 0);
      }

      // Current period: one row per pay item. YTD: cumulative per pay item
      // across the tax year, not summed from this payslip alone (handoff §0.11).
      const current = new Map();
      for (const line of linesRes.data ?? []) {
        const item = line.pay_items;
        if (!item) continue;
        const row = current.get(item.code) ?? { code: item.code, name: item.name, category: item.category, amount: 0, ytd: 0 };
        row.amount += Number(line.amount);
        current.set(item.code, row);
      }
      for (const line of ytdLines) {
        const item = line.pay_items;
        if (!item) continue;
        const row = current.get(item.code) ?? { code: item.code, name: item.name, category: item.category, amount: 0, ytd: 0 };
        row.ytd += Number(line.amount);
        current.set(item.code, row);
      }

      const rows = [...current.values()]
        .filter((r) => r.amount !== 0 || r.ytd !== 0)
        .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9));

      const sumCategory = (categories, field) =>
        rows.filter((r) => categories.includes(r.category)).reduce((s, r) => s + r[field], 0);

      if (!cancelled) {
        setData({
          slip: slipRes.data,
          emp: empRes.data,
          run: runRes.data,
          rows,
          incomeCurrent: sumCategory(["income"], "amount"),
          incomeYtd: sumCategory(["income"], "ytd"),
          deductionCurrent: sumCategory(["deduction", "statutory"], "amount"),
          deductionYtd: sumCategory(["deduction", "statutory"], "ytd"),
          employerCurrent: sumCategory(["employer_contribution"], "amount"),
          employerYtd: sumCategory(["employer_contribution"], "ytd"),
          nettYtd: ytdNett,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [runId, employeeNumber]);

  if (error) return <p className="p-8 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-8 text-sm text-muted-foreground">Loading payslip…</p>;

  const { slip, emp, run, rows } = data;
  const [surname = "", firstnames = ""] = String(emp.full_name ?? "").split(", ");
  const title = slip.finalised_at ? "Payslip" : "Draft Payslip";
  const employeeRows = rows.filter((r) => r.category !== "employer_contribution");
  const employerRows = rows.filter((r) => r.category === "employer_contribution");
  const address = [
    [emp.residential_street_no, emp.residential_street].filter(Boolean).join(" "),
    emp.residential_complex,
    emp.residential_unit_number,
    emp.residential_suburb,
    emp.residential_city,
    emp.residential_postal_code,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-[13px] leading-snug text-black">
      <div className="print:hidden mb-6 flex gap-3">
        <Button variant="outline" size="sm" onClick={async () => { await logAudit({ action: "print_payslip", entity: "payslip", entityId: employeeNumber, payRunId: runId, employeeNumber }); window.print(); }}>
          Print / save as PDF
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <img src="/hae-logo-transparent.png" alt="Hospital AT Ekhaya" className="h-24 w-auto" />
        <div className="text-right">
          <p>24952 Hulana &amp; Motopo</p>
          <p>Galeshewe</p>
          <p>Kimberley</p>
          <p>8345</p>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <div>
          <p>
            {title} for {surname}, {firstnames}
          </p>
          <p>
            Period: {isoDay(run.period_start)} to {isoDay(run.period_end)}
          </p>
          <p>ID Number: {maskId(emp.id_number)}</p>
          <p>Employee Number: {emp.employee_number}</p>
        </div>
        <div className="text-right">
          <p>Job Title: {emp.job_title ?? "—"}</p>
          <p>Employment Date: {dateText(emp.employment_date) || "—"}</p>
          <p>Pay Point: {emp.pay_points?.name ?? "—"}</p>
        </div>
      </div>

      <div className="mt-8 flex gap-8">
        <table className="w-3/5">
          <thead>
            <tr>
              <th className="text-left"></th>
              <th className="text-right font-normal">Current</th>
              <th className="text-right font-normal">YTD</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-neutral-200">
              <td className="font-medium">Income</td>
              <td className="text-right">{money(data.incomeCurrent)}</td>
              <td className="text-right">{money(data.incomeYtd)}</td>
            </tr>
            {employeeRows
              .filter((r) => r.category === "income")
              .map((r) => (
                <tr key={r.code}>
                  <td className="pl-3">{r.name}</td>
                  <td className="text-right">{money(r.amount)}</td>
                  <td className="text-right">{money(r.ytd)}</td>
                </tr>
              ))}
            <tr className="bg-neutral-200">
              <td className="font-medium">Deduction</td>
              <td className="text-right">{money(data.deductionCurrent)}</td>
              <td className="text-right">{money(data.deductionYtd)}</td>
            </tr>
            {employeeRows
              .filter((r) => r.category === "deduction" || r.category === "statutory")
              .map((r) => (
                <tr key={r.code}>
                  <td className="pl-3">{r.name}</td>
                  <td className="text-right">{money(r.amount)}</td>
                  <td className="text-right">{money(r.ytd)}</td>
                </tr>
              ))}
            <tr className="bg-neutral-200">
              <td className="font-medium">Nett Pay</td>
              <td className="text-right">R {money(slip.nett_pay)}</td>
              <td className="text-right">R {money(data.nettYtd)}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-2/5">
          <thead>
            <tr>
              <th className="text-left"></th>
              <th className="text-right font-normal">Current</th>
              <th className="text-right font-normal">YTD</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-neutral-200">
              <td className="font-medium">Employer Contribution</td>
              <td className="text-right">{money(data.employerCurrent)}</td>
              <td className="text-right">{money(data.employerYtd)}</td>
            </tr>
            {employerRows.map((r) => (
              <tr key={r.code}>
                <td className="pl-3">{r.name}</td>
                <td className="text-right">{money(r.amount)}</td>
                <td className="text-right">{money(r.ytd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 space-y-1">
        <p className="font-bold">Employee Banking Details</p>
        <p>Account number: {maskAccount(emp.banking_account_number)}</p>
        <p>Branch code: {emp.banking_branch_code ?? "—"}</p>
        <p>Account type: {emp.banking_account_type ?? "—"}</p>
        <p>Bank: {emp.banking_bank_name ?? "—"}</p>
      </div>

      {address.length > 0 && (
        <div className="mt-8 space-y-1">
          <p className="font-bold">Employee Address</p>
          {address.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <p className="mt-12 text-xs text-neutral-600">
        This payslip is confidential and intended solely for the named employee.
      </p>
    </div>
  );
}

export default function PayslipPrintPage() {
  return (
    <ProtectedRoute>
      <PayslipPrintContent />
    </ProtectedRoute>
  );
}
