"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Runs a Supabase query and normalizes it into one of three UI states.
function useSupabaseProbe(runQuery) {
  const [state, setState] = useState({ status: "loading", rows: null, errorMessage: "" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data, error } = await runQuery();
      if (cancelled) return;

      if (error) {
        setState({ status: "error", rows: null, errorMessage: `${error.code ?? ""} ${error.message}`.trim() });
        return;
      }
      if (!data || data.length === 0) {
        setState({ status: "empty", rows: null, errorMessage: "" });
        return;
      }
      setState({ status: "success", rows: data, errorMessage: "" });
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function ProbeResult({ label, state, emptyHint }) {
  return (
    <div className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
      <p className="font-medium">{label}</p>
      {state.status === "loading" && <p className="text-muted-foreground">Querying…</p>}
      {state.status === "success" && (
        <>
          <p className="font-medium text-green-600 dark:text-green-400">
            Success — returned {state.rows.length} row(s).
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(state.rows, null, 2)}
          </pre>
        </>
      )}
      {state.status === "empty" && (
        <p className="text-amber-600 dark:text-amber-400">
          Succeeded, zero rows. {emptyHint}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-destructive">Failed: {state.errorMessage}</p>
      )}
    </div>
  );
}

function RlsTestContent() {
  const { user, employee } = useAuth();

  const selfServiceProbe = useSupabaseProbe(() =>
    supabase.from("my_employee_profile").select("*")
  );
  const directProbe = useSupabaseProbe(() =>
    supabase.from("employees").select("employee_number, is_active, is_director").limit(5)
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Supabase RLS bridge test</CardTitle>
          <CardDescription>
            Firebase UID: <code>{user?.uid}</code>
            <br />
            Employee number from Firestore employees match: <code>{employee?.id ?? "none"}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <ProbeResult
            label="1. payroll.my_employee_profile (self-service view)"
            state={selfServiceProbe}
            emptyHint="Either shared.get_own_employee_number() isn't resolving your uid, or access_control/{uid} has no employeeNumber linking you to a payroll.employees row yet."
          />
          <ProbeResult
            label="2. payroll.employees direct (up to 5 rows)"
            state={directProbe}
            emptyHint="If this also returns zero rows, the auth bridge itself likely isn't reaching Postgres correctly. If this returns MULTIPLE rows instead, your account has executive/payroll_admin access — my_employee_profile being empty above would then just mean you don't have your own linked employee record, which is expected for an admin-only account."
          />
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
