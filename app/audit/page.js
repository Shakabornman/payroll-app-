"use client";

import { useCallback, useEffect, useState } from "react";
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

function formatWhen(value) {
  return new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function errorText(error) {
  return `${error.code ?? ""} ${error.message}`.trim();
}

function AuditContent() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [entries, setEntries] = useState([]);
  const [archivedMonths, setArchivedMonths] = useState([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadEntries = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("audit_log")
      .select("id, occurred_at, actor_email, action, entity, entity_id, employee_number, details")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (loadError) {
      setError(errorText(loadError));
      return;
    }
    setEntries(data ?? []);
  }, []);

  const loadArchivedMonths = useCallback(async () => {
    const { data, error: archiveError } = await supabase
      .from("audit_log_archive")
      .select("archive_month");
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
    ? entries.filter((e) =>
        [e.action, e.entity, e.entity_id, e.employee_number, e.actor_email]
          .some((v) => String(v ?? "").toLowerCase().includes(term))
      )
    : entries;

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
            placeholder="Filter by action, entity, employee or user"
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
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{formatWhen(e.occurred_at)}</TableCell>
                <TableCell>{e.actor_email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{e.action}</Badge>
                </TableCell>
                <TableCell>
                  {e.entity ?? "—"} {e.entity_id ? `(${e.entity_id})` : ""}
                </TableCell>
                <TableCell>{e.employee_number ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs">
                  {e.details ? JSON.stringify(e.details) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 && <p className="text-sm text-muted-foreground">No entries match.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Archived months</h2>
        {archivedMonths.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing archived yet.</p>
        )}
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
