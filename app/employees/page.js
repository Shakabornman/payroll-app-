"use client";

import { useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { EmployeeSelector } from "@/components/employee-selector";
import { EmployeeDetailView } from "@/components/employee-detail-view";

function EmployeesContent() {
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  if (selectedEmployee) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
        <EmployeeDetailView employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Employees</h1>
      <EmployeeSelector onSelect={setSelectedEmployee} />
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
