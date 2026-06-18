"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Briefcase,
  Star,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrintReportButton } from "./print-report-button";
import { OrgScopeSelect } from "./org-scope-select";
import type { EligibleOrg } from "@/lib/insights/org-scope";

const NAV_ITEMS = [
  { label: "Overview", href: "/insights", icon: LayoutDashboard, exact: true },
  { label: "Workforce", href: "/insights/workforce", icon: Users },
  { label: "Leave", href: "/insights/leave", icon: CalendarDays },
  { label: "Payroll", href: "/insights/payroll", icon: Wallet },
  { label: "Hiring", href: "/insights/hiring", icon: Briefcase },
  { label: "Performance", href: "/insights/performance", icon: Star },
];

export function InsightsNav({
  eligibleOrgs = [],
  activeOrgId = "",
}: {
  eligibleOrgs?: EligibleOrg[];
  activeOrgId?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/insights" className="flex items-center gap-2.5">
            <Image
              src="/Jamba.png"
              alt="JambaHR"
              width={32}
              height={32}
              className="rounded-lg shadow-lg shadow-violet-500/20"
            />
            <span className="flex flex-col gap-0.5 leading-none">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                JambaHR
              </span>
              <span className="text-base font-bold tracking-tight text-violet-200">
                Insights
              </span>
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

        <div className="flex items-center gap-1">
          {eligibleOrgs.length >= 2 && (
            <OrgScopeSelect eligibleOrgs={eligibleOrgs} activeOrgId={activeOrgId} />
          )}
          <PrintReportButton />
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
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
