"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "@/components/nav-bar";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }) {
  const { user, authorized, hasStaffRecord, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user || authorized) return;
    if (sessionStorage.getItem("access_refused_logged") === user.uid) return;
    sessionStorage.setItem("access_refused_logged", user.uid);
    logAudit({ action: "access_refused", entity: "payroll_app", details: { path: window.location.pathname } });
  }, [loading, user, authorized]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Access not authorised</h1>
          <p className="text-sm text-muted-foreground">
            {hasStaffRecord
              ? "Your account doesn't have access to HR Payroll. Contact the COO if you need it."
              : "Your account isn't linked to an HAE employee record. Contact the COO to get access to the HR Payroll portal."}
          </p>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
