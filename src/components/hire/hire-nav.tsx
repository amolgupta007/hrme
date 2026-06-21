"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LayoutDashboard, FileText, Users, Kanban, CalendarDays, FileSignature, ArrowLeft, UserPlus, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { label: "Overview", href: "/hire", icon: LayoutDashboard, exact: true },
  { label: "Jobs", href: "/hire/jobs", icon: FileText },
  { label: "Candidates", href: "/hire/candidates", icon: Users },
  { label: "Pipeline", href: "/hire/pipeline", icon: Kanban },
  { label: "Interviews", href: "/hire/interviews", icon: CalendarDays },
  { label: "Offers", href: "/hire/offers", icon: FileSignature },
];

const REFERRALS_NAV_ITEM = { label: "Referrals", href: "/hire/referrals", icon: UserPlus };

export function HireNav({ referralsEnabled = false }: { referralsEnabled?: boolean } = {}) {
  const navItems = referralsEnabled ? [...NAV_ITEMS, REFERRALS_NAV_ITEM] : NAV_ITEMS;
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(item: (typeof navItems)[number]) {
    return "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-indigo-100 bg-white/90 backdrop-blur-lg dark:border-indigo-900/40 dark:bg-[#100e1f]/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        {/* Brand + desktop links */}
        <div className="flex items-center gap-6">
          {/* Mobile hamburger — opens a left Sheet with all sections */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open JambaHire sections"
                className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-5 py-4 text-left">
                <SheetTitle className="text-base font-semibold text-indigo-700 dark:text-indigo-300">
                  JambaHire
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="JambaHire sections" className="flex flex-col p-2">
                {navItems.map((item) => {
                  const active = isActive(item);
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/hire" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-indigo-700 dark:text-indigo-300">
              JambaHire
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = isActive(item);
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
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Back to JambaHR</span>
        </Link>
      </div>
    </nav>
  );
}
