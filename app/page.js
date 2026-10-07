"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const QUICK_LINKS = [
  { href: "/payslips", label: "Payslip processing", description: "Process the current pay run" },
  { href: "/hours", label: "Hours & timesheets", description: "Reconcile hourly workers" },
  { href: "/reports", label: "Statutory reports", description: "EMP201, EMP501, UIF, IRP5" },
  { href: "/exports", label: "Exports", description: "EFT batch and Xero entries" },
  { href: "/employees", label: "Employees", description: "Search and filter staff" },
];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CurrentPayPeriod() {
  const [payRun, setPayRun] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("pay_runs")
      .select("id, period_start, period_end, pay_date, status")
      .order("period_start", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          setError(`${error.code ?? ""} ${error.message}`.trim());
        } else {
          setPayRun(data?.[0] ?? null);
        }
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load pay runs: {error}. If this is a permission error, the
        client needs to run{" "}
        <code className="font-mono">GRANT SELECT ON payroll.pay_runs TO authenticated;</code>{" "}
        in Supabase.
      </p>
    );
  }

  if (!payRun) {
    return <p className="text-sm text-muted-foreground">No pay runs recorded yet.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div>
        <p className="text-sm text-muted-foreground">
          {formatDate(payRun.period_start)} – {formatDate(payRun.period_end)}
        </p>
        <p className="text-sm text-muted-foreground">Pay date {formatDate(payRun.pay_date)}</p>
      </div>
      <Badge variant={payRun.status === "finalised" ? "success" : "warning"}>
        {payRun.status === "finalised" ? "Finalised" : "Draft"}
      </Badge>
    </div>
  );
}

function DashboardContent() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Current pay period</CardTitle>
        </CardHeader>
        <CardContent>
          <CurrentPayPeriod />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Quick links</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>{link.label}</CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outstanding items</CardTitle>
          <CardDescription>
            Unreconciled hours, missing timesheets, pending filings, variances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
