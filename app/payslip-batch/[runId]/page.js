"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { PayslipDocument } from "@/components/payslip-document";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

function BatchPayslipsContent() {
  const { runId } = useParams();
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: slips, error: slipsError } = await supabase
        .from("payslips")
        .select("employee_number")
        .eq("pay_run_id", runId);
      if (slipsError) {
        if (!cancelled) setError(`${slipsError.code ?? ""} ${slipsError.message}`.trim());
        return;
      }
      const numbers = (slips ?? []).map((s) => s.employee_number);
      if (numbers.length === 0) {
        if (!cancelled) setEmployees([]);
        return;
      }
      const { data: people, error: peopleError } = await supabase
        .from("employees")
        .select("employee_number, full_name")
        .in("employee_number", numbers);
      if (peopleError) {
        if (!cancelled) setError(`${peopleError.code ?? ""} ${peopleError.message}`.trim());
        return;
      }
      const sorted = (people ?? [])
        .map((p) => p.employee_number)
        .sort((a, b) => {
          const na = (people.find((p) => p.employee_number === a)?.full_name ?? "").toLowerCase();
          const nb = (people.find((p) => p.employee_number === b)?.full_name ?? "").toLowerCase();
          return na.localeCompare(nb);
        });
      if (!cancelled) setEmployees(sorted);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) return <p className="p-8 text-sm text-destructive">{error}</p>;
  if (employees === null) return <p className="p-8 text-sm text-muted-foreground">Loading payslips…</p>;

  return (
    <div>
      <div className="print:hidden mx-auto mt-6 flex max-w-3xl items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await logAudit({
              action: "print_payslip",
              entity: "payslip_batch",
              entityId: runId,
              payRunId: runId,
              details: { batch: true, payslips: employees.length },
            });
            window.print();
          }}
        >
          Print / save as PDF
        </Button>
        <span className="text-sm text-muted-foreground">{employees.length} payslips, one per page</span>
      </div>
      {employees.map((employeeNumber, index) => (
        <div
          key={employeeNumber}
          style={index < employees.length - 1 ? { pageBreakAfter: "always", breakAfter: "page" } : undefined}
        >
          <PayslipDocument runId={runId} employeeNumber={employeeNumber} />
        </div>
      ))}
    </div>
  );
}

export default function BatchPayslipsPage() {
  return (
    <ProtectedRoute>
      <BatchPayslipsContent />
    </ProtectedRoute>
  );
}
