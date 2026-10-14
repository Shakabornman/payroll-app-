"use client";

import { useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { EmployeeSelector, ALL_PAY_POINTS } from "@/components/employee-selector";
import { EmployeeDetailView } from "@/components/employee-detail-view";

// Search, pay-point filter and sort are owned here, not inside
// EmployeeSelector - that component unmounts whenever a detail view is open
// (only one of the two ever renders below), so state kept inside it was
// silently reset every time someone went back from an employee's detail.
function EmployeesContent() {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [search, setSearch] = useState("");
  const [payPointId, setPayPointId] = useState(ALL_PAY_POINTS);
  const [sort, setSort] = useState({ key: "full_name", dir: "asc" });

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
      <EmployeeSelector
        onSelect={setSelectedEmployee}
        search={search}
        onSearchChange={setSearch}
        payPointId={payPointId}
        onPayPointIdChange={setPayPointId}
        sort={sort}
        onSortChange={setSort}
      />
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
