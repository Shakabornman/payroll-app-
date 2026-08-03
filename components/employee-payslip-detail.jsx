"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetHourlyRateDialog } from "@/components/set-hourly-rate-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value) {
  if (value === null || value === undefined) return "—";
  return `R ${Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

// Must-fix before shipping anything with banking data (see hae-payroll-screen-map
// memory) - only the account number is masked, matching the real SimplePay
// system's "Mask Bank Account Number" behaviour (branch code/bank name/account
// type are not sensitive in the same way and are shown in full there too).
function maskAccountNumber(value) {
  const str = String(value ?? "").trim();
  if (!str) return "—";
  if (str.length <= 4) return "•".repeat(str.length);
  return "•".repeat(str.length - 4) + str.slice(-4);
}

function grantHint(table) {
  return (
    <>
      If this is a permission error, the client needs to run{" "}
      <code className="font-mono">GRANT SELECT ON payroll.{table} TO authenticated;</code>{" "}
      in Supabase.
    </>
  );
}

// Fires one query, tracks its own loading/error/data state, independent of
// the other sections - a 42501 on one table (e.g. a table nobody has
// queried yet, see hae-payroll-screen-map memory) shouldn't blank the rest.
function useSection(queryFn, deps) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    let cancelled = false;
    // Deliberate loading-state reset on deps change, not a synchronization bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ loading: true, error: "", data: null });
    queryFn().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setState({ loading: false, error: `${error.code ?? ""} ${error.message}`.trim(), data: null });
      } else {
        setState({ loading: false, error: "", data: data ?? [] });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function SectionBody({ section, table, empty, children }) {
  if (section.loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (section.error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load: {section.error}. {grantHint(table)}
      </p>
    );
  }
  if (section.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return children;
}

// Real SimplePay groups UIF-Employee and Tax (PAYE) under "Deduction" in its
// own UI even though our schema tags them category = 'statutory' (see
// hae-simplepay-design-reference memory, screens 17-24) - match that grouping
// rather than inventing a fourth visible bucket.
function lineGroup(category) {
  if (category === "income") return "income";
  if (category === "employer_contribution") return "employer_contribution";
  return "deduction";
}

function LineItemTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pay item</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>YTD</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.pay_items?.name ?? "—"}</TableCell>
            <TableCell>{formatMoney(row.amount)}</TableCell>
            <TableCell>{formatMoney(row.ytd_amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EmployeePayslipDetail({ employee, payRunId }) {
  const employeeNumber = employee.employee_number;
  const [regularInputsRefreshKey, setRegularInputsRefreshKey] = useState(0);

  const payslip = useSection(
    () =>
      supabase
        .from("payslips")
        .select(
          "gross_remuneration, gross_remuneration_taxable, nett_pay, normal_hours, normal_rate, cost_to_company, finalised_at"
        )
        .eq("employee_number", employeeNumber)
        .eq("pay_run_id", payRunId),
    [employeeNumber, payRunId]
  );

  const regularInputs = useSection(
    () =>
      supabase
        .from("employee_regular_inputs")
        .select("id, amount, effective_from, effective_to, pay_items(name, category)")
        .eq("employee_number", employeeNumber)
        .order("effective_from", { ascending: false }),
    [employeeNumber, regularInputsRefreshKey]
  );

  const payslipLines = useSection(
    () =>
      supabase
        .from("payslip_lines")
        .select("id, amount, ytd_amount, pay_items(name, category)")
        .eq("employee_number", employeeNumber)
        .eq("pay_run_id", payRunId),
    [employeeNumber, payRunId]
  );

  const leaveBalances = useSection(
    () =>
      supabase
        .from("leave_balances")
        .select("leave_type, balance, taken, scheduled, adjustment")
        .eq("employee_number", employeeNumber)
        .eq("pay_run_id", payRunId),
    [employeeNumber, payRunId]
  );

  const banking = useSection(
    () =>
      supabase
        .from("employees")
        .select(
          "payment_method, banking_bank_name, banking_branch_code, banking_account_type, banking_account_number"
        )
        .eq("employee_number", employeeNumber),
    [employeeNumber]
  );

  const run = payslip.data?.[0];

  const income = payslipLines.data?.filter((row) => lineGroup(row.pay_items?.category) === "income") ?? [];
  const deductions =
    payslipLines.data?.filter((row) => lineGroup(row.pay_items?.category) === "deduction") ?? [];
  const employerContributions =
    payslipLines.data?.filter((row) => lineGroup(row.pay_items?.category) === "employer_contribution") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {employee.full_name} <span className="text-muted-foreground">#{employeeNumber}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SectionBody section={payslip} table="payslips" empty="No payslip processed yet for this pay run.">
            {run && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Gross remuneration</p>
                  <p className="text-sm font-medium">{formatMoney(run.gross_remuneration)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nett pay</p>
                  <p className="text-sm font-medium">{formatMoney(run.nett_pay)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost to company</p>
                  <p className="text-sm font-medium">{formatMoney(run.cost_to_company)}</p>
                </div>
                <Badge variant={run.finalised_at ? "default" : "secondary"}>
                  {run.finalised_at ? `Finalised ${formatDate(run.finalised_at)}` : "Draft"}
                </Badge>
              </div>
            )}
          </SectionBody>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payslip breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SectionBody
            section={payslipLines}
            table="payslip_lines"
            empty="No payslip lines captured for this pay run yet."
          >
            <div className="space-y-4">
              {income.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Income</p>
                  <LineItemTable rows={income} />
                </div>
              )}
              {deductions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Deductions</p>
                  <LineItemTable rows={deductions} />
                </div>
              )}
              {employerContributions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                    Employer contribution
                  </p>
                  <LineItemTable rows={employerContributions} />
                </div>
              )}
            </div>
          </SectionBody>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Banking details</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionBody section={banking} table="employees" empty="No banking details on record.">
            {banking.data?.[0] && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Payment method</p>
                  <p className="font-medium">{banking.data[0].payment_method ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank</p>
                  <p className="font-medium">{banking.data[0].banking_bank_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Branch code</p>
                  <p className="font-medium">{banking.data[0].banking_branch_code ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account type</p>
                  <p className="font-medium">{banking.data[0].banking_account_type ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account number</p>
                  <p className="font-medium">{maskAccountNumber(banking.data[0].banking_account_number)}</p>
                </div>
              </div>
            )}
          </SectionBody>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regular inputs</CardTitle>
          <CardAction>
            <SetHourlyRateDialog
              employeeNumber={employeeNumber}
              onSaved={() => setRegularInputsRefreshKey((key) => key + 1)}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <SectionBody
            section={regularInputs}
            table="employee_regular_inputs"
            empty="No regular inputs on record for this employee."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pay item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Effective to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularInputs.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.pay_items?.name ?? "—"}</TableCell>
                    <TableCell>{row.pay_items?.category ?? "—"}</TableCell>
                    <TableCell>{formatMoney(row.amount)}</TableCell>
                    <TableCell>{formatDate(row.effective_from)}</TableCell>
                    <TableCell>{row.effective_to ? formatDate(row.effective_to) : "Ongoing"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionBody>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leave balance</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionBody
            section={leaveBalances}
            table="leave_balances"
            empty="No leave balance recorded for this pay run."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave type</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Taken</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Adjustment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveBalances.data?.map((row) => (
                  <TableRow key={row.leave_type}>
                    <TableCell>{row.leave_type}</TableCell>
                    <TableCell>{row.balance ?? "—"}</TableCell>
                    <TableCell>{row.taken ?? "—"}</TableCell>
                    <TableCell>{row.scheduled ?? "—"}</TableCell>
                    <TableCell>{row.adjustment ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionBody>
        </CardContent>
      </Card>
    </div>
  );
}
