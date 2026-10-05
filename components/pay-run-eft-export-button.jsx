"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

// ABSA Business Integrator Online (.csv), layout confirmed from the sample
// payment file (payment_run1.csv): no header row, one line per payment:
// 1 company branch, 2 company account, 3 company name, 4 beneficiary name,
// 5 beneficiary branch, 6 beneficiary account, 7 beneficiary reference,
// 8 own reference, 9 amount, 10 employee number.
function surnameAndFirst(fullName) {
  const [surname = "", firstnames = ""] = String(fullName ?? "").split(", ");
  const first = firstnames.trim().split(/\s+/)[0] ?? "";
  return { surname: surname.trim(), first };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Only EFT staff with a positive nett pay are paid by this file. Cash staff
// are left out, and anyone EFT-paid without complete bank details stops the
// export - a bad account number would fail at the bank, not here.
export function PayRunEftExportButton({ payRunId, periodLabel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleExport() {
    setError("");
    setNotice("");
    setBusy(true);

    const [settingsRes, slipsRes] = await Promise.all([
      supabase
        .from("employer_settings")
        .select("trading_name, banking_branch_code, banking_account_number")
        .maybeSingle(),
      supabase.from("payslips").select("employee_number, nett_pay").eq("pay_run_id", payRunId),
    ]);
    const failed = [settingsRes, slipsRes].find((r) => r.error);
    if (failed) {
      setError(`${failed.error.code ?? ""} ${failed.error.message}`.trim());
      setBusy(false);
      return;
    }

    const company = settingsRes.data;
    if (!company?.banking_account_number || !company?.banking_branch_code) {
      setError("Company bank details are missing in employer settings. Export stopped.");
      setBusy(false);
      return;
    }

    const payable = (slipsRes.data ?? []).filter((s) => Number(s.nett_pay ?? 0) > 0);
    const numbers = payable.map((s) => s.employee_number);
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("employee_number, full_name, payment_method, banking_bank_name, banking_branch_code, banking_account_number")
      .in("employee_number", numbers.length ? numbers : [""]);
    if (employeesError) {
      setError(`${employeesError.code ?? ""} ${employeesError.message}`.trim());
      setBusy(false);
      return;
    }

    const byNumber = new Map((employees ?? []).map((e) => [e.employee_number, e]));
    const eft = [];
    const problems = [];
    for (const slip of payable) {
      const emp = byNumber.get(slip.employee_number);
      if (!emp || emp.payment_method !== "EFT") continue;
      if (!emp.banking_branch_code || !emp.banking_account_number) {
        problems.push(`${slip.employee_number} ${emp.full_name}`);
        continue;
      }
      eft.push({ emp, amount: Number(slip.nett_pay) });
    }

    if (problems.length > 0) {
      setError(`Missing bank details, export stopped: ${problems.join("; ")}`);
      setBusy(false);
      return;
    }

    eft.sort((a, b) => a.emp.employee_number.localeCompare(b.emp.employee_number));
    const lines = eft.map(({ emp, amount }) => {
      const { surname, first } = surnameAndFirst(emp.full_name);
      return [
        company.banking_branch_code,
        company.banking_account_number,
        company.trading_name,
        `${first} ${surname}`.trim(),
        emp.banking_branch_code,
        emp.banking_account_number,
        `${surname} ${first.charAt(0)}`.trim(),
        company.trading_name,
        amount.toFixed(2),
        emp.employee_number,
      ]
        .map(csvCell)
        .join(",");
    });

    const total = eft.reduce((s, p) => s + p.amount, 0);
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `absa-eft-${periodLabel}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    await logAudit({ action: "export_eft", entity: "pay_run", entityId: payRunId, payRunId, details: { file: link.download, payments: eft.length, total: total.toFixed(2) } });

    setNotice(`Exported ${eft.length} EFT payments, total R ${total.toFixed(2)}.`);
    setBusy(false);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleExport} disabled={busy}>
        {busy ? "Exporting…" : "Export ABSA EFT file"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </>
  );
}
