"use client";

import { ProtectedRoute } from "@/components/protected-route";

function ReportsContent() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Statutory reports & filings</h1>
      <p className="text-sm text-muted-foreground">Not built yet.</p>
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
