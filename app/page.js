"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { supabase } from "@/lib/supabase";
import { computeDashboardStats, todayInSouthAfrica } from "@/lib/dashboard-stats";
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

function formatSyncTime(value) {
  return new Date(value).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorText(error) {
  return `${error.code ?? ""} ${error.message}`.trim();
}

// All dashboard data comes from the same tables as the screens it links to.
// The newest pay run is "current"; the tiles and outstanding items look at
// every pay run that is not finalised yet.
function useDashboardData() {
  const [state, setState] = useState({
    loading: true,
    error: "",
    payRuns: [],
    payslips: [],
    lastSynced: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: payRuns, error: runsError } = await supabase
        .from("pay_runs")
        .select("id, period_start, period_end, pay_date, status, pay_frequencies(name)")
        .order("period_start", { ascending: false });
      if (cancelled) return;
      if (runsError) {
        setState((s) => ({ ...s, loading: false, error: errorText(runsError) }));
        return;
      }

      // Only the payslips of open runs are needed, which also keeps the
      // query well under the database's default row limit.
      const openIds = (payRuns ?? []).filter((run) => run.status !== "finalised").map((run) => run.id);
      const [payslipResult, syncResult] = await Promise.all([
        openIds.length
          ? supabase.from("payslips").select("pay_run_id, finalised_at, normal_hours").in("pay_run_id", openIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("employees")
          .select("last_synced_at")
          .not("last_synced_at", "is", null)
          .order("last_synced_at", { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;

      setState({
        loading: false,
        error: payslipResult.error ? `Payslips: ${errorText(payslipResult.error)}` : "",
        payRuns: payRuns ?? [],
        payslips: payslipResult.data ?? [],
        lastSynced: syncResult.data?.[0]?.last_synced_at ?? null,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function StatTile({ href, label, value, note }) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        </CardHeader>
        {note && (
          <CardContent>
            <p className="text-xs text-muted-foreground">{note}</p>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function buildOutstandingItems(stats) {
  const items = [];
  if (stats.hoursNotCaptured > 0) {
    items.push({
      href: "/hours",
      title: `${plural(stats.hoursNotCaptured, "hourly payslip has", "hourly payslips have")} no hours captured`,
      detail: `In ${plural(stats.runsWithoutHoursCount, "open pay run", "open pay runs")}`,
    });
  }
  if (stats.awaitingFinalisation > 0) {
    items.push({
      href: "/payslips",
      title: `${plural(stats.awaitingFinalisation, "payslip is", "payslips are")} not finalised yet`,
      detail: `In ${plural(stats.runsAwaitingCount, "open pay run", "open pay runs")}`,
    });
  }
  for (const run of stats.pastPayDate) {
    items.push({
      href: "/payslips",
      title: "A pay run is past its pay date and not finalised",
      detail: `${run.pay_frequencies?.name ?? "Pay run"}, pay date ${formatDate(run.pay_date)}`,
    });
  }
  return items;
}

function DashboardContent() {
  const { loading, error, payRuns, payslips, lastSynced } = useDashboardData();

  const stats = useMemo(
    () => computeDashboardStats({ payRuns, payslips, today: todayInSouthAfrica() }),
    [payRuns, payslips]
  );
  const outstanding = useMemo(() => buildOutstandingItems(stats), [stats]);
  const currentRun = payRuns[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {lastSynced && (
          <p className="text-sm text-muted-foreground">
            Employee data last synced from the HR Portal on {formatSyncTime(lastSynced)}.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Failed to load pay runs: {error}. If this is a permission error, the
          client needs to run{" "}
          <code className="font-mono">GRANT SELECT ON payroll.pay_runs TO authenticated;</code>{" "}
          in Supabase.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardDescription>Current pay period</CardDescription>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && !currentRun && !error && (
            <p className="text-sm text-muted-foreground">No pay runs recorded yet.</p>
          )}
          {currentRun && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <CardTitle className="text-2xl">
                {formatDate(currentRun.period_start)} – {formatDate(currentRun.period_end)}
              </CardTitle>
              <Badge variant={currentRun.status === "finalised" ? "success" : "warning"}>
                {currentRun.status === "finalised" ? "Finalised" : "Draft"}
              </Badge>
            </div>
          )}
        </CardHeader>
        {currentRun && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {currentRun.pay_frequencies?.name ?? "Pay run"} · pay date {formatDate(currentRun.pay_date)}
            </p>
          </CardContent>
        )}
      </Card>

      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            href="/payslips"
            label="Open pay runs"
            value={stats.openRunCount}
            note="Pay runs not finalised yet"
          />
          <StatTile
            href="/payslips"
            label="Payslips awaiting finalisation"
            value={stats.awaitingFinalisation}
            note="In open pay runs"
          />
          <StatTile
            href="/hours"
            label="Hourly payslips with no hours"
            value={stats.hoursNotCaptured}
            note="Hours not captured yet, open Two Weekly runs"
          />
        </div>
      )}

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
          <CardDescription>What needs attention in the open pay runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && !error && outstanding.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
          )}
          {outstanding.map((item, index) => (
            <Link key={`${item.href}-${index}`} href={item.href} className="block">
              <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            </Link>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Statutory filing due dates and variance checks are not tracked here yet.
          </p>
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
