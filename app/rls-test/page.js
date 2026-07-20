"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function RlsTestContent() {
  const [status, setStatus] = useState("loading");
  const [rows, setRows] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data, error } = await supabase.from("my_employee_profile").select("*");
      if (cancelled) return;

      if (error) {
        setErrorMessage(`${error.code ?? ""} ${error.message}`.trim());
        setStatus("error");
        return;
      }

      if (!data || data.length === 0) {
        setStatus("empty");
        return;
      }

      setRows(data);
      setStatus("success");
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Supabase RLS bridge test</CardTitle>
          <CardDescription>
            Queries payroll.my_employee_profile using your real signed-in
            session. This proves whether the Firebase-to-Supabase auth bridge
            works from an actual browser, not just the Supabase SQL Editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status === "loading" && <p>Querying Supabase…</p>}

          {status === "success" && (
            <>
              <p className="font-medium text-green-600 dark:text-green-400">
                Success — the RLS bridge works. Returned {rows.length} row(s).
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(rows, null, 2)}
              </pre>
            </>
          )}

          {status === "empty" && (
            <p className="text-amber-600 dark:text-amber-400">
              Query succeeded but returned zero rows. Either RLS is silently
              blocking you, or there&apos;s no payroll.employees row matching
              your employee number yet — worth checking both.
            </p>
          )}

          {status === "error" && (
            <p className="text-destructive">Query failed: {errorMessage}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RlsTestPage() {
  return (
    <ProtectedRoute>
      <RlsTestContent />
    </ProtectedRoute>
  );
}
