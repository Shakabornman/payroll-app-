"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { Emp201Report } from "@/components/emp201-report";
import { Emp501Report } from "@/components/emp501-report";
import { UifDeclarationReport } from "@/components/uif-declaration-report";

function ReportsContent() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Statutory reports & filings</h1>
        <p className="text-sm text-muted-foreground">
          EMP201, EMP501 and UIF Declaration are built. UI-19, Salary Schedule, OID and IRP5 are not yet.
        </p>
      </div>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">EMP201 (monthly)</h2>
        <Emp201Report />
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">EMP501 (bi-annual reconciliation)</h2>
        <Emp501Report />
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">UIF Declaration (monthly)</h2>
        <UifDeclarationReport />
      </section>
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
