"use client";

import { Button } from "@/components/ui/button";

// Prints every payslip in the chosen pay run, one per page. Only posted
// (finalised) runs can be batch printed.
export function BatchPayslipPrint({ payRunId, posted }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={!payRunId || !posted}
        onClick={() => window.open(`/payslip-batch/${payRunId}`, "_blank", "noopener")}
      >
        Print batch payslips
      </Button>
      {!posted && <span className="text-sm text-muted-foreground">Post the pay run to batch print it.</span>}
    </div>
  );
}
