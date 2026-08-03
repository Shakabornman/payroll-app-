"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NavBar } from "@/components/nav-bar";

export function ProtectedRoute({ children }) {
  const { user, authorized, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

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
        <div className="max-w-sm space-y-2 text-center">
          <h1 className="text-lg font-semibold">Access not authorised</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t linked to an HAE employee record. Contact
            the COO to get access to the HR Payroll portal.
          </p>
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
