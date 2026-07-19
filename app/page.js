"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

function HomeContent() {
  const { user, employee, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {user?.email} (employee #{employee?.id}). The HR Payroll
        portal starts here.
      </p>
      <Button variant="outline" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}
