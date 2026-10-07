"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { EkhayaConnectStrip } from "@/components/ekhaya-connect-strip";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/payslips", label: "Payslip processing" },
  { href: "/hours", label: "Hours & timesheets" },
  { href: "/reports", label: "Statutory reports" },
  { href: "/exports", label: "Exports" },
  { href: "/employees", label: "Employees" },
  { href: "/audit", label: "Audit trail" },
];

export function NavBar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <>
    <EkhayaConnectStrip />
    <header className="print:hidden border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {/* The logo artwork needs a light ground, so it sits on a white chip in dark mode. */}
          <Image
            src="/hae-mark.png"
            alt="Hospital at Ekhaya"
            width={56}
            height={38}
            unoptimized
            className="h-9 w-auto rounded-md dark:bg-white dark:px-1"
          />
          <span className="text-sm font-semibold">HR Payroll</span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user?.email && (
            <span className="text-sm text-muted-foreground">{user.email}</span>
          )}
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
    </>
  );
}
