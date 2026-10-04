"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { Emp201Report } from "@/components/emp201-report";

function ReportsContent() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Statutory reports & filings</h1>
        <p className="text-sm text-muted-foreground">
          EMP201 is built. EMP501, UIF Declaration, UI-19, Salary Schedule, OID and IRP5 are not yet.
        </p>
      </div>
      <Emp201Report />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <ReportsContent />
    </ProtectedRoute>
  );
}
