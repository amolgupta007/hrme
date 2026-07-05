"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaveRequestForm } from "./leave-request-form";
import { LeaveRequestsTable } from "./leave-requests-table";
import type { Employee, UserRole } from "@/types";
import { hasPermission } from "@/types";
import type { LeaveRequestWithDetails, PolicyWithUsage, EmployeeBalance } from "@/actions/leaves";

interface LeavesClientProps {
  employees: Employee[];
  policies: PolicyWithUsage[];
  requests: LeaveRequestWithDetails[];
  balances: EmployeeBalance[];
  role: UserRole;
  currentEmployeeId: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  paid:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  sick:      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  casual:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  unpaid:    "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  maternity: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  paternity: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  custom:    "bg-muted text-muted-foreground",
};

export function LeavesClient({ employees, policies, requests, balances, role, currentEmployeeId }: LeavesClientProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  const canApprove = hasPermission(role, "manager");

  // Employees only see their own requests
  const visibleRequests = canApprove
    ? requests
    : requests.filter((r) => r.employee_id === currentEmployeeId);

  const filtered = filter === "all" ? visibleRequests : visibleRequests.filter((r) => r.status === filter);

  return (
    <>
      {/* Balance cards */}
      {policies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {policies.map((policy) => {
            const pct = policy.days_per_year > 0
              ? Math.round((policy.used_days / policy.days_per_year) * 100)
              : 0;
            return (
              <div key={policy.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-sm">{policy.name}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[policy.type] ?? TYPE_COLORS.custom}`}>
                    {policy.type}
                  </span>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-bold">{policy.remaining_days}</span>
                  <span className="text-sm text-muted-foreground">/ {policy.days_per_year} days</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{policy.used_days} used this year</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Requests table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Leave Requests</h2>
          <Button onClick={() => setFormOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Request Leave
          </Button>
        </div>
        <LeaveRequestsTable
          requests={filtered}
          activeFilter={filter}
          onFilterChange={setFilter}
          canApprove={canApprove}
        />
      </div>

      <LeaveRequestForm
        open={formOpen}
        onOpenChange={setFormOpen}
        employees={employees}
        policies={policies}
        balances={balances}
      />
    </>
  );
}
