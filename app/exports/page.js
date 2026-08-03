"use client";

import { ProtectedRoute } from "@/components/protected-route";

function ExportsContent() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Exports</h1>
      <p className="text-sm text-muted-foreground">Not built yet.</p>
    </div>
  );
}

export default function ExportsPage() {
  return (
    <ProtectedRoute>
      <ExportsContent />
    </ProtectedRoute>
  );
}
