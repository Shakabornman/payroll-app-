"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { EmployeeSelector } from "@/components/employee-selector";

function EmployeesContent() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Employees</h1>
      <EmployeeSelector />
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <ProtectedRoute>
      <EmployeesContent />
    </ProtectedRoute>
  );
}
