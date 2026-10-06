"use client";

import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { PayslipDocument } from "@/components/payslip-document";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

function PayslipPrintContent() {
  const { runId, employee: employeeNumber } = useParams();

  return (
    <div>
      <div className="print:hidden mx-auto mt-6 flex max-w-3xl gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await logAudit({ action: "print_payslip", entity: "payslip", entityId: employeeNumber, payRunId: runId, employeeNumber });
            window.print();
          }}
        >
          Print / save as PDF
        </Button>
      </div>
      <PayslipDocument runId={runId} employeeNumber={employeeNumber} />
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
