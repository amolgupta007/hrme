"use client";

import { Search, Bell, Briefcase, FileText, Calendar, Target } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { PendingCounts } from "@/actions/notifications";
import type { UserRole } from "@/types";

interface HeaderProps {
  jambaHireEnabled?: boolean;
  badges?: PendingCounts;
  role?: UserRole;
}

export function Header({ jambaHireEnabled = false, badges, role = "employee" }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const isManagerOrAbove = role === "owner" || role === "admin" || role === "manager";
  const totalCount = (badges?.leaves ?? 0) + (badges?.documents ?? 0) + (badges?.objectives ?? 0);

  // Build notification items based on role
  const items = [
    isManagerOrAbove && (badges?.leaves ?? 0) > 0 && {
      icon: <Calendar className="h-4 w-4 text-amber-500" />,
      label: "Pending leave requests",
      count: badges!.leaves,
      href: "/dashboard/leaves",
      color: "bg-amber-50 dark:bg-amber-950/40",
    },
    (badges?.documents ?? 0) > 0 && {
      icon: <FileText className="h-4 w-4 text-indigo-500" />,
      label: "Documents to acknowledge",
      count: badges!.documents,
      href: "/dashboard/documents",
      color: "bg-indigo-50 dark:bg-indigo-950/40",
    },
    isManagerOrAbove && (badges?.objectives ?? 0) > 0 && {
      icon: <Target className="h-4 w-4 text-emerald-500" />,
      label: "Objectives pending approval",
      count: badges!.objectives,
      href: "/dashboard/objectives",
      color: "bg-emerald-50 dark:bg-emerald-950/40",
    },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; count: number; href: string; color: string }[];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-lg">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search employees, leaves, documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-muted/30 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-4">
        {/* JambaHire switcher */}
        {jambaHireEnabled && (
          <Link
            href="/hire"
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:bg-indigo-950"
          >
            <Briefcase className="h-3.5 w-3.5" />
            JambaHire
          </Link>
        )}

        {/* Notifications bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Bell className="h-5 w-5" />
            {totalCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {totalCount > 9 ? "9+" : totalCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Notifications</p>
                {totalCount > 0 && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {totalCount} pending
                  </span>
                )}
              </div>

              {items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">You&apos;re all caught up!</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">No pending actions right now.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.count} {item.count === 1 ? "item" : "items"} need your attention
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-bold">
                        {item.count}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              <div className="border-t border-border px-4 py-2.5">
                <p className="text-xs text-muted-foreground text-center">
                  Showing items that need your action
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
