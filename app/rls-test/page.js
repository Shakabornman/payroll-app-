"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Runs a Supabase query and normalizes it into one of three UI states.
// Pass `skip: true` to short-circuit without querying (e.g. no target id yet).
function useSupabaseProbe(runQuery, deps, skip = false) {
  const [state, setState] = useState({ status: "loading", rows: null, errorMessage: "" });

  useEffect(() => {
    if (skip) return;

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
  }, [skip, ...deps]);

  if (skip) {
    return { status: "skipped", rows: null, errorMessage: "" };
  }
  return state;
}

function ProbeResult({ label, state, emptyHint, skippedHint }) {
  return (
    <div className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
      <p className="font-medium">{label}</p>
      {state.status === "loading" && <p className="text-muted-foreground">Querying…</p>}
      {state.status === "skipped" && <p className="text-muted-foreground">{skippedHint}</p>}
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

// Lists every `employees` doc matching the signed-in user's email, so
// duplicate/wrong matches (see hae_access_control_detail memory) are
// visible directly instead of guessed at.
function useFirestoreEmailMatches(email) {
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    async function run() {
      const snapshot = await getDocs(
        query(collection(db, "employees"), where("email", "==", email))
      );
      if (cancelled) return;
      setMatches(snapshot.docs.map((doc) => ({ id: doc.id, email: doc.data().email })));
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return matches;
}

function RlsTestContent() {
  const { user, employee } = useAuth();
  const employeeNumber = employee?.id ?? null;
  const firestoreMatches = useFirestoreEmailMatches(user?.email);

  const selfServiceProbe = useSupabaseProbe(
    () => supabase.from("my_employee_profile").select("*"),
    []
  );

  const directProbe = useSupabaseProbe(
    () =>
      supabase
        .from("employees")
        .select("employee_number, is_active, is_director")
        .eq("employee_number", employeeNumber),
    [employeeNumber],
    !employeeNumber
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Supabase RLS bridge test</CardTitle>
          <CardDescription>
            Firebase UID: <code>{user?.uid}</code>
            <br />
            Employee number in use (first match): <code>{employeeNumber ?? "none"}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
            <p className="font-medium">0. Every employees doc matching your email</p>
            {firestoreMatches === null && <p className="text-muted-foreground">Querying…</p>}
            {firestoreMatches?.length === 1 && (
              <p className="font-medium text-green-600 dark:text-green-400">
                Exactly one match: <code>{firestoreMatches[0].id}</code>. No duplicates.
              </p>
            )}
            {firestoreMatches?.length > 1 && (
              <>
                <p className="font-medium text-destructive">
                  {firestoreMatches.length} documents share this email — the app picked
                  the first one arbitrarily, which is likely the wrong record.
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(firestoreMatches, null, 2)}
                </pre>
              </>
            )}
            {firestoreMatches?.length === 0 && (
              <p className="text-destructive">
                No employees doc matches your email at all — but you got past the
                access gate, so this shouldn&apos;t be possible. Worth a refresh.
              </p>
            )}
          </div>
          <ProbeResult
            label="1. payroll.my_employee_profile (self-service view)"
            state={selfServiceProbe}
            emptyHint="Either shared.get_own_employee_number() isn't resolving your uid, or access_control/{uid} has no employeeNumber linking you to a payroll.employees row yet."
          />
          <ProbeResult
            label={`2. payroll.employees direct, filtered to your own number (${employeeNumber ?? "?"})`}
            state={directProbe}
            emptyHint="RLS is not letting your own row-match through, even filtered to your exact employee number. Points at the auth bridge or get_own_employee_number() itself."
            skippedHint="No employee number resolved from Firestore for this account — nothing to filter by."
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
