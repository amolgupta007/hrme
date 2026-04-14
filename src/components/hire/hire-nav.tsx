"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LayoutDashboard, FileText, Users, Kanban, CalendarDays, FileSignature, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", href: "/hire", icon: LayoutDashboard, exact: true },
  { label: "Jobs", href: "/hire/jobs", icon: FileText },
  { label: "Candidates", href: "/hire/candidates", icon: Users },
  { label: "Pipeline", href: "/hire/pipeline", icon: Kanban },
  { label: "Interviews", href: "/hire/interviews", icon: CalendarDays },
  { label: "Offers", href: "/hire/offers", icon: FileSignature },
];

export function HireNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-indigo-100 bg-white/90 backdrop-blur-lg dark:border-indigo-900/40 dark:bg-[#100e1f]/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/hire" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-indigo-700 dark:text-indigo-300">
              JambaHire
            </span>
          </Link>

          {/* Nav links */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Back to JambaHR */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to JambaHR
        </Link>
      </div>
    </nav>
  );
}
