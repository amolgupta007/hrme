"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Briefcase,
  Star,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", href: "/insights", icon: LayoutDashboard, exact: true },
  { label: "Workforce", href: "/insights/workforce", icon: Users },
  { label: "Leave", href: "/insights/leave", icon: CalendarDays },
  { label: "Payroll", href: "/insights/payroll", icon: Wallet },
  { label: "Hiring", href: "/insights/hiring", icon: Briefcase },
  { label: "Performance", href: "/insights/performance", icon: Star },
];

export function InsightsNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/insights" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/25">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-violet-200">
              Insights
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active =
                "exact" in item && item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-violet-500/15 text-violet-200"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      {/* Mobile tab row */}
      <div className="scroll-thin flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active =
            "exact" in item && item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                active ? "bg-violet-500/15 text-violet-200" : "text-slate-400"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
