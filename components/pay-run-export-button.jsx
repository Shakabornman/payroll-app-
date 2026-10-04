"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One row per payslip in the run - the full register, so every figure can be
// checked against a spreadsheet instead of clicking through each employee.
export function PayRunExportButton({ payRunId, periodLabel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setError("");
    setBusy(true);

    const { data: payslips, error: payslipsError } = await supabase
      .from("payslips")
      .select(
        "employee_number, normal_hours, normal_rate, gross_remuneration, gross_remuneration_taxable, nett_pay, cost_to_company, finalised_at"
      )
      .eq("pay_run_id", payRunId);
    if (payslipsError) {
      setError(`${payslipsError.code ?? ""} ${payslipsError.message}`.trim());
      setBusy(false);
      return;
    }

    const employeeNumbers = [...new Set((payslips ?? []).map((p) => p.employee_number))];
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("employee_number, full_name, job_title")
      .in("employee_number", employeeNumbers.length ? employeeNumbers : [""]);
    if (employeesError) {
      setError(`${employeesError.code ?? ""} ${employeesError.message}`.trim());
      setBusy(false);
      return;
    }

    const byNumber = new Map((employees ?? []).map((e) => [e.employee_number, e]));
    const header = [
      "Employee #",
      "Name",
      "Job title",
      "Hours",
      "Rate",
      "Gross",
      "Gross taxable",
      "Nett pay",
      "Cost to company",
      "Status",
    ];
    const rows = (payslips ?? [])
      .map((p) => ({ p, emp: byNumber.get(p.employee_number) }))
      .sort((a, b) => (a.emp?.full_name ?? "").localeCompare(b.emp?.full_name ?? ""))
      .map(({ p, emp }) => [
        p.employee_number,
        emp?.full_name ?? "",
        emp?.job_title ?? "",
        p.normal_hours,
        p.normal_rate,
        p.gross_remuneration,
        p.gross_remuneration_taxable,
        p.nett_pay,
        p.cost_to_company,
        p.finalised_at ? "Finalised" : "Draft",
      ]);

    const csv = [header, ...rows].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pay-run-${periodLabel}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleExport} disabled={busy}>
        {busy ? "Exporting…" : "Export CSV"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
