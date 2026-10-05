"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

// Xero account mapping as confirmed by the client (2026-10-05). Each line is
// one pay item on one side of the journal; debits and credits must balance.
const XERO_LINES = [
  { side: "debit", code: "PRE_OPENING_INCOME", label: "Pre-opening Income", account: "477", accountName: "Wages and Salaries" },
  { side: "debit", code: "BASIC_SALARY", label: "Basic Salary", account: "477", accountName: "Wages and Salaries" },
  { side: "debit", code: "BASIC_HOURLY", label: "Basic Hourly Pay", account: "477", accountName: "Wages and Salaries" },
  { side: "debit", code: "EXTRA_SHIFT", label: "Extra Shift", account: "477", accountName: "Wages and Salaries" },
  { side: "debit", code: "UIF_ER", label: "UIF - Employer", account: "477", accountName: "Wages and Salaries" },
  { side: "debit", code: "SDL_ER", label: "SDL - Employer", account: "477", accountName: "Wages and Salaries" },
  { side: "credit", code: "UIF_TOTAL", label: "UIF Total", account: "825", accountName: "Employee Tax Payable" },
  { side: "credit", code: "SDL_ER", label: "SDL - Employer", account: "825", accountName: "Employee Tax Payable" },
  { side: "credit", code: "PAYE", label: "Tax (PAYE)", account: "825", accountName: "Employee Tax Payable" },
  { side: "credit", code: "NETT", label: "Nett Pay", account: "810", accountName: "Salary and Wages Clearing Account" },
  { side: "credit", code: "SHIFT_DEDUCTION", label: "Shift Deduction", account: "810", accountName: "Salary and Wages Clearing Account" },
  { side: "credit", code: "REPAYMENT_ADVANCE", label: "Repayment of Advance", account: "810", accountName: "Salary and Wages Clearing Account" },
];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

// One Xero manual journal per pay run. Amounts are summed from the stored
// payslip lines, so the journal reflects exactly what was calculated; nett
// pay comes from payslips.nett_pay. Garnishee is not in the mapping, so any
// amount for it stops the export rather than being posted to the wrong account.
export function PayRunXeroExportButton({ payRunId, payDate, frequencyName, periodLabel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setError("");
    setBusy(true);

    const [linesRes, slipsRes, garnisheeRes] = await Promise.all([
      supabase.from("payslip_lines").select("amount, pay_items(code)").eq("pay_run_id", payRunId),
      supabase.from("payslips").select("nett_pay").eq("pay_run_id", payRunId),
      supabase.from("payslip_lines").select("amount, pay_items!inner(code)").eq("pay_run_id", payRunId).eq("pay_items.code", "GARNISHEE"),
    ]);
    const failed = [linesRes, slipsRes, garnisheeRes].find((r) => r.error);
    if (failed) {
      setError(`${failed.error.code ?? ""} ${failed.error.message}`.trim());
      setBusy(false);
      return;
    }

    const garnishee = (garnisheeRes.data ?? []).reduce((s, l) => s + Number(l.amount), 0);
    if (garnishee !== 0) {
      setError("This run has Garnishee amounts, which are not in the Xero mapping yet. Export stopped.");
      setBusy(false);
      return;
    }

    const byCode = new Map();
    for (const line of linesRes.data ?? []) {
      const code = line.pay_items?.code;
      byCode.set(code, (byCode.get(code) ?? 0) + Number(line.amount));
    }
    const sum = (codes) => codes.reduce((s, c) => s + (byCode.get(c) ?? 0), 0);

    const amounts = {
      PRE_OPENING_INCOME: sum(["PRE_OPENING_INCOME"]),
      BASIC_SALARY: sum(["BASIC_SALARY"]),
      BASIC_HOURLY: sum(["BASIC_HOURLY"]),
      EXTRA_SHIFT: sum(["EXTRA_SHIFT"]),
      UIF_ER: sum(["UIF_ER"]),
      SDL_ER: sum(["SDL_ER"]),
      UIF_TOTAL: sum(["UIF_EE", "UIF_ER"]),
      PAYE: sum(["PAYE"]),
      NETT: (slipsRes.data ?? []).reduce((s, p) => s + Number(p.nett_pay ?? 0), 0),
      SHIFT_DEDUCTION: sum(["SHIFT_DEDUCTION"]),
      REPAYMENT_ADVANCE: sum(["REPAYMENT_ADVANCE"]),
    };

    const journal = XERO_LINES.map((l) => ({ ...l, amount: money(amounts[l.code]) }));
    const debits = money(journal.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0));
    const credits = money(journal.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0));
    if (debits !== credits) {
      setError(`Journal does not balance: debits ${debits.toFixed(2)} vs credits ${credits.toFixed(2)}. Export stopped.`);
      setBusy(false);
      return;
    }

    const narration = `${frequencyName ?? "Payroll"} ${periodLabel}`;
    const header = ["Narration", "Date", "Account code", "Account name", "Description", "Debit", "Credit"];
    const rows = journal.map((l) => [
      narration,
      payDate,
      l.account,
      l.accountName,
      l.label,
      l.side === "debit" ? l.amount.toFixed(2) : "",
      l.side === "credit" ? l.amount.toFixed(2) : "",
    ]);
    const csv = [header, ...rows].map((line) => line.map(csvCell).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xero-journal-${periodLabel}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    await logAudit({ action: "export_xero", entity: "pay_run", entityId: payRunId, payRunId, details: { file: link.download, debits, credits } });
    setBusy(false);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleExport} disabled={busy}>
        {busy ? "Exporting…" : "Export Xero journal"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
