"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALL_PAY_POINTS = "all";

const SORT_ACCESSORS = {
  employee_number: (e) => e.employee_number,
  full_name: (e) => e.full_name,
  job_title: (e) => e.job_title,
  pay_point: (e) => e.pay_points?.name,
  status: (e) => (e.is_active ? "Active" : "Inactive"),
};

const COLUMNS = [
  { key: "employee_number", label: "Employee #" },
  { key: "full_name", label: "Name" },
  { key: "job_title", label: "Job title" },
  { key: "pay_point", label: "Pay point" },
  { key: "status", label: "Status" },
];

function sortIndicator(sort, key) {
  if (sort.key !== key) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

// Read-only, shared across Payslip processing and Reports per the client's
// screen map. No "classification" filter yet - the classification columns
// mentioned in the original handoff don't exist in any migration we have
// (payroll.employees only has employee_number, full_name, job_title,
// employment_date, banking_*, pay_frequency_id, pay_point_id, payment_method,
// is_active) - add it once that schema gap is confirmed, not before.
export function EmployeeSelector({ onSelect }) {
  const [search, setSearch] = useState("");
  const [payPointId, setPayPointId] = useState(ALL_PAY_POINTS);
  const [payPoints, setPayPoints] = useState([]);
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "full_name", dir: "asc" });

  const sortedEmployees = useMemo(() => {
    if (!employees) return null;
    const accessor = SORT_ACCESSORS[sort.key];
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...employees].sort((a, b) => {
      const av = accessor(a) ?? "";
      const bv = accessor(b) ?? "";
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * direction;
    });
  }, [employees, sort]);

  function toggleSort(key) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  useEffect(() => {
    supabase
      .from("pay_points")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (!error) setPayPoints(data ?? []);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let q = supabase
        .from("employees")
        .select("employee_number, full_name, job_title, is_active, pay_points(name)")
        .order("full_name");

      const term = search.trim();
      if (term) {
        q = q.or(`full_name.ilike.%${term}%,employee_number.ilike.%${term}%`);
      }
      if (payPointId !== ALL_PAY_POINTS) {
        q = q.eq("pay_point_id", payPointId);
      }

      const { data, error } = await q;
      if (cancelled) return;

      if (error) {
        setError(`${error.code ?? ""} ${error.message}`.trim());
        setEmployees(null);
        return;
      }
      setError("");
      setEmployees(data ?? []);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [search, payPointId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or employee number"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select
          items={[
            { value: ALL_PAY_POINTS, label: "All pay points" },
            ...payPoints.map((point) => ({ value: point.id, label: point.name })),
          ]}
          value={payPointId}
          onValueChange={setPayPointId}
        >
          <SelectTrigger>
            <SelectValue placeholder="All pay points" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PAY_POINTS}>All pay points</SelectItem>
            {payPoints.map((point) => (
              <SelectItem key={point.id} value={point.id}>
                {point.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">Failed to load employees: {error}</p>
      )}

      {!error && employees === null && (
        <p className="text-sm text-muted-foreground">Loading employees…</p>
      )}

      {!error && employees?.length === 0 && (
        <p className="text-sm text-muted-foreground">No employees match.</p>
      )}

      {!error && sortedEmployees && sortedEmployees.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column.key}>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.label}
                    {sortIndicator(sort, column.key)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEmployees.map((employee) => (
              <TableRow key={employee.employee_number}>
                <TableCell>{employee.employee_number}</TableCell>
                <TableCell>
                  {onSelect ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => onSelect(employee)}
                    >
                      {employee.full_name}
                    </button>
                  ) : (
                    employee.full_name
                  )}
                </TableCell>
                <TableCell>{employee.job_title ?? "—"}</TableCell>
                <TableCell>{employee.pay_points?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={employee.is_active ? "default" : "secondary"}>
                    {employee.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
