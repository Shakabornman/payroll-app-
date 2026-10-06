"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const GROUP_WINDOW_MS = 120000;

function formatWhen(value) {
  return new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function formatDay(value) {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function errorText(error) {
  return `${error.code ?? ""} ${error.message}`.trim();
}

function money(value) {
  return Number(value ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Short names for pay frequencies, as used elsewhere in the app.
function shortFrequency(name) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("month end")) return "Month End";
  if (n.includes("pay run 15")) return "Pay Run 15";
  if (n.includes("two weekly")) return "Two Weekly";
  return name ?? "Pay run";
}

function runLabel(run) {
  if (!run) return "";
  return `${shortFrequency(run.pay_frequencies?.name)}, ${formatDay(run.period_start)} to ${formatDay(run.period_end)}`;
}

// Turns one log row into a plain-language action, plus a short detail line.
// The raw row stays available underneath for anyone who needs it.
function describe(entry) {
  const d = entry.details ?? {};
  const after = (k) => d[k]?.new;
  const before = (k) => d[k]?.old;
  const emp = entry.employee_number ? `Employee ${entry.employee_number}` : "";

  switch (entry.action) {
    case "sign_in":
      return { key: "sign_in", label: "Signed in", detail: "" };
    case "sign_out":
      return { key: "sign_out", label: "Signed out", detail: "" };
    case "access_refused":
      return { key: "access_refused", label: "Access refused", detail: "Signed in but not linked to an employee record" };
    case "export_csv":
      return { key: "export_csv", label: "Exported pay run CSV", detail: d.file ?? "" };
    case "export_xero":
      return { key: "export_xero", label: "Exported Xero journal", detail: d.file ?? "" };
    case "export_eft":
      return { key: "export_eft", label: "Exported ABSA EFT file", detail: `${d.payments ?? "?"} payments, total R ${d.total ?? "?"}` };
    case "print_payslip":
      return { key: "print_payslip", label: "Printed payslip", detail: emp };
    case "report_generated":
      return { key: `report_${entry.entity}`, label: `Generated ${String(entry.entity ?? "report").toUpperCase()}`, detail: "" };
    case "recalculate_payslips":
      return { key: "recalculate", label: "Recalculated payslips", detail: d.payslips != null ? `${d.payslips} payslips` : "" };
    default:
      break;
  }

  const [op, table] = String(entry.action).split(" ");
  if (table === "payslips") {
    if (op === "insert") return { key: "payslip_created", label: "Payslip created", detail: emp };
    if (op === "delete") return { key: "payslip_deleted", label: "Payslip deleted", detail: emp };
    if (after("finalised_at")) return { key: "finalised", label: "Payslip finalised", detail: emp };
    if (d.finalised_at && after("finalised_at") === null) return { key: "unfinalised", label: "Payslip unfinalised", detail: emp };
    if (d.normal_hours) {
      return { key: "hours", label: "Hours changed", detail: `${emp}, ${before("normal_hours")} to ${after("normal_hours")} hours` };
    }
    if (d.normal_rate) {
      return { key: "rate_on_slip", label: "Hourly rate changed on payslip", detail: `${emp}, R ${before("normal_rate")} to R ${after("normal_rate")}` };
    }
    if (d.nett_pay) {
      return { key: "recalc", label: "Payslip recalculated", detail: `${emp}, nett pay R ${money(before("nett_pay"))} to R ${money(after("nett_pay"))}` };
    }
    return { key: "payslip_changed", label: "Payslip changed", detail: emp };
  }
  if (table === "pay_runs") {
    if (op === "insert") return { key: "run_created", label: "Pay run created", detail: "" };
    if (op === "update" && d.status) {
      if (after("status") === "finalised") return { key: "run_posted", label: "Pay run posted (locked)", detail: "" };
      if (after("status") === "draft") return { key: "run_unposted", label: "Pay run unlocked (draft)", detail: "" };
    }
    return { key: "run_changed", label: "Pay run changed", detail: "" };
  }
  if (table === "payslip_lines") {
    const amount = d.amount?.new ?? d.amount;
    if (op === "insert") return { key: "line_added", label: "Pay line added", detail: `${emp}${amount != null ? `, R ${money(amount)}` : ""}` };
    if (op === "delete") return { key: "line_removed", label: "Pay line removed", detail: emp };
    return { key: "line_changed", label: "Pay line changed", detail: emp };
  }
  if (table === "employee_regular_inputs") {
    if (op === "insert") return { key: "input_added", label: "Salary or rate entered", detail: `${emp}${d.amount != null ? `, R ${money(d.amount)}` : ""}` };
    return { key: "input_changed", label: "Salary or rate changed", detail: emp };
  }
  if (table === "employees") {
    return { key: "employee_changed", label: "Employee record changed", detail: `${emp}${Object.keys(d).length ? `, ${Object.keys(d).join(", ")}` : ""}` };
  }
  return { key: `${op}_${table}`, label: `${op ?? "Change"} ${table ?? ""}`.trim(), detail: emp };
}

// Bulk actions (e.g. finalising 16 payslips) arrive as rows written seconds
// apart by the same person for the same pay run. They're shown as one summary
// line; the individual rows stay available underneath.
function groupEntries(entries, runs) {
  const groups = [];
  for (const entry of entries) {
    const info = describe(entry);
    const last = groups[groups.length - 1];
    const time = new Date(entry.occurred_at).getTime();
    const sameBatch =
      last &&
      last.key === info.key &&
      last.actor === entry.actor_email &&
      last.payRunId === entry.pay_run_id &&
      Math.abs(last.lastTime - time) <= GROUP_WINDOW_MS;
    if (sameBatch) {
      last.rows.push({ entry, info });
      last.lastTime = time;
    } else {
      groups.push({
        key: info.key,
        actor: entry.actor_email,
        payRunId: entry.pay_run_id,
        lastTime: time,
        firstWhen: entry.occurred_at,
        label: info.label,
        rows: [{ entry, info }],
      });
    }
  }
  return groups.map((g) => ({
    ...g,
    runText: g.payRunId ? runLabel(runs[g.payRunId]) : "",
  }));
}

function AuditContent() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [entries, setEntries] = useState([]);
  const [runs, setRuns] = useState({});
  const [archivedMonths, setArchivedMonths] = useState([]);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadEntries = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("audit_log")
      .select("id, occurred_at, actor_email, action, entity, entity_id, pay_run_id, employee_number, details")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (loadError) {
      setError(errorText(loadError));
      return;
    }
    const rows = data ?? [];
    setEntries(rows);

    const runIds = [...new Set(rows.map((r) => r.pay_run_id).filter(Boolean))];
    if (runIds.length > 0) {
      const { data: runData, error: runError } = await supabase
        .from("pay_runs")
        .select("id, period_start, period_end, pay_frequencies(name)")
        .in("id", runIds);
      if (runError) {
        setError(errorText(runError));
        return;
      }
      setRuns(Object.fromEntries((runData ?? []).map((r) => [r.id, r])));
    }
  }, []);

  const loadArchivedMonths = useCallback(async () => {
    const { data, error: archiveError } = await supabase.from("audit_log_archive").select("archive_month");
    if (archiveError) {
      setError(errorText(archiveError));
      return;
    }
    const months = [...new Set((data ?? []).map((r) => r.archive_month))].sort().reverse();
    setArchivedMonths(months);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const { data: admin, error: adminError } = await supabase.rpc("is_payroll_admin");
      if (cancelled) return;
      if (adminError) {
        setError(errorText(adminError));
        return;
      }
      setIsAdmin(Boolean(admin));
      if (!admin) return;

      const { error: archiveError } = await supabase.rpc("archive_audit_completed_months");
      if (archiveError) {
        setError(errorText(archiveError));
        return;
      }
      await Promise.all([loadEntries(), loadArchivedMonths()]);
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [loadEntries, loadArchivedMonths]);

  async function unarchive(month) {
    setError("");
    setNotice("");
    const { data, error: rpcError } = await supabase.rpc("unarchive_audit_month", { p_month: month });
    if (rpcError) {
      setError(errorText(rpcError));
      return;
    }
    setNotice(`${data} entries for ${month} are back in the live log.`);
    await Promise.all([loadEntries(), loadArchivedMonths()]);
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-sm text-muted-foreground">Only payroll admins can view the audit trail.</p>
      </div>
    );
  }

  const term = filter.trim().toLowerCase();
  const visible = term
    ? entries.filter((e) => {
        const info = describe(e);
        return [info.label, info.detail, e.action, e.entity, e.employee_number, e.actor_email, runLabel(runs[e.pay_run_id])]
          .some((v) => String(v ?? "").toLowerCase().includes(term));
      })
    : entries;
  const groups = groupEntries(visible, runs);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Who did what and when. Entries are added automatically and cannot be edited or deleted. Completed months
          are archived each time this page opens; archives are kept indefinitely.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">Live log</h2>
          <Input
            placeholder="Filter by action, employee, pay run or user"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const isBatch = g.rows.length > 1;
              const open = expanded[g.firstWhen + g.key];
              const summary = isBatch
                ? `${g.rows.length} × ${g.label.toLowerCase()}${g.runText ? `, ${g.runText}` : ""}`
                : g.label;
              const single = g.rows[0];
              return (
                <Fragment key={g.firstWhen + g.key + g.rows.length}>
                  <TableRow>
                    <TableCell>{formatWhen(g.firstWhen)}</TableCell>
                    <TableCell>{g.actor ?? "—"}</TableCell>
                    <TableCell>
                      {isBatch ? (
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setExpanded((prev) => ({ ...prev, [g.firstWhen + g.key]: !open }))}
                        >
                          <Badge variant="secondary" className="mr-2">{g.rows.length}</Badge>
                          {summary}
                        </button>
                      ) : (
                        summary
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {isBatch ? (g.runText || "") : `${single.info.detail}${g.runText ? ` · ${g.runText}` : ""}`}
                    </TableCell>
                  </TableRow>
                  {isBatch &&
                    open &&
                    g.rows.map(({ entry, info }) => (
                      <TableRow key={entry.id} className="bg-muted/40">
                        <TableCell className="pl-8 text-xs">{formatWhen(entry.occurred_at)}</TableCell>
                        <TableCell className="text-xs">{entry.actor_email ?? "—"}</TableCell>
                        <TableCell className="text-xs">{info.label}</TableCell>
                        <TableCell className="text-xs">{info.detail}</TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No entries match.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Archived months</h2>
        {archivedMonths.length === 0 && <p className="text-sm text-muted-foreground">Nothing archived yet.</p>}
        {archivedMonths.map((month) => (
          <div key={month} className="flex items-center justify-between rounded-lg border px-4 py-2">
            <span className="text-sm">{month}</span>
            <Button size="sm" variant="outline" onClick={() => unarchive(month)}>
              Bring back to live log
            </Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Brought-back months stay in the live log and are not archived again automatically.
        </p>
      </section>
    </div>
  );
}

export default function AuditPage() {
  return (
    <ProtectedRoute>
      <AuditContent />
    </ProtectedRoute>
  );
}
