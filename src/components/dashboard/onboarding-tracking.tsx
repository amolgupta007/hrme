"use client";

import React from "react";
import { cn, getInitials, formatDate } from "@/lib/utils";
import type { EmployeeOnboardingSummary } from "@/config/onboarding";

type Filter = "all" | "complete" | "in_progress" | "not_started";

function getStatus(s: EmployeeOnboardingSummary): Filter {
  if (s.totalEnabled === 0) return "complete";
  if (s.totalComplete === 0) return "not_started";
  if (s.allRequiredComplete && s.totalComplete === s.totalEnabled) return "complete";
  return "in_progress";
}

const STATUS_LABELS: Record<string, string> = {
  complete: "Complete",
  in_progress: "In Progress",
  not_started: "Not Started",
};

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  not_started: "bg-muted text-muted-foreground",
};

export function OnboardingTracking({
  data,
  search,
}: {
  data: EmployeeOnboardingSummary[];
  search: string;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const filtered = data.filter((emp) => {
    const matchesSearch =
      search === "" ||
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(search.toLowerCase());
    const status = getStatus(emp);
    const matchesFilter = filter === "all" || status === filter;
    return matchesSearch && matchesFilter;
  });

  const counts = {
    all: data.length,
    complete: data.filter((e) => getStatus(e) === "complete").length,
    in_progress: data.filter((e) => getStatus(e) === "in_progress").length,
    not_started: data.filter((e) => getStatus(e) === "not_started").length,
  };

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(["all", "complete", "in_progress", "not_started"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/40"
            )}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No employees match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((emp) => {
                const status = getStatus(emp);
                return (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                          {getInitials(`${emp.first_name} ${emp.last_name}`)}
                        </div>
                        <span className="font-medium">
                          {emp.first_name} {emp.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(emp.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{
                              width: emp.totalEnabled > 0
                                ? `${Math.round((emp.totalComplete / emp.totalEnabled) * 100)}%`
                                : "100%",
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {emp.totalComplete}/{emp.totalEnabled}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status])}>
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
