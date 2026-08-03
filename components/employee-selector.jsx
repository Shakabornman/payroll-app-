"use client";

import { useEffect, useState } from "react";
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

      {!error && employees && employees.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Pay point</TableHead>
              <TableHead>Status</TableHead>
              {onSelect && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.employee_number}>
                <TableCell>{employee.employee_number}</TableCell>
                <TableCell>{employee.full_name}</TableCell>
                <TableCell>{employee.job_title ?? "—"}</TableCell>
                <TableCell>{employee.pay_points?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={employee.is_active ? "default" : "secondary"}>
                    {employee.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {onSelect && (
                  <TableCell>
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => onSelect(employee)}
                    >
                      Select
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
