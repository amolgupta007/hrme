"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Check, X, Ban, CalendarDays, AlertTriangle, Ticket, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveLeave, rejectLeave, cancelLeave } from "@/actions/leaves";
import type { LeaveRequestWithDetails } from "@/actions/leaves";
import { describeHalfDay } from "@/lib/leaves/half-day";
import { formatWorkedDate } from "@/lib/leaves/comp-off";
import { canCancelLeave } from "@/lib/leaves/cancel-rules";
import { istTodayDate } from "@/lib/attendance/manual-punch-validation";

const TYPE_LABELS: Record<string, string> = {
  paid: "Paid", unpaid: "Unpaid", sick: "Sick",
  casual: "Casual", maternity: "Maternity", paternity: "Paternity", custom: "Custom",
  comp_off: "Comp-off",
};

interface LeaveRequestsTableProps {
  requests: LeaveRequestWithDetails[];
  activeFilter: string;
  onFilterChange: (f: string) => void;
  canApprove?: boolean;
  isAdmin?: boolean;
  currentEmployeeId?: string | null;
}

const FILTERS = ["all", "pending", "approved", "rejected", "cancelled"] as const;

export function LeaveRequestsTable({
  requests, activeFilter, onFilterChange, canApprove = false, isAdmin = false, currentEmployeeId = null,
}: LeaveRequestsTableProps) {
  const [acting, setActing] = React.useState<string | null>(null);
  const todayIst = istTodayDate();

  // Mirrors cancelLeave's rule. Manager-of-record is approximated by manager+
  // and the payroll lock isn't known here — the server has the final say.
  const cancellable = (req: LeaveRequestWithDetails) =>
    canCancelLeave({
      status: req.status,
      startDate: req.start_date,
      todayIst,
      isOwn: req.employee_id === currentEmployeeId,
      isManagerOfRecord: canApprove,
      isAdmin,
      payrollLocked: false,
    }).ok;

  async function handleApprove(id: string) {
    setActing(id);
    const result = await approveLeave(id);
    setActing(null);
    result.success ? toast.success("Leave approved") : toast.error(result.error);
  }

  async function handleReject(id: string) {
    setActing(id);
    const result = await rejectLeave(id);
    setActing(null);
    result.success ? toast.success("Leave rejected") : toast.error(result.error);
  }

  async function handleCancel(req: LeaveRequestWithDetails) {
    const id = req.id;
    const message =
      req.status === "approved"
        ? "Cancel this approved leave? The days go back to the balance, and the employee and their manager are emailed."
        : "Cancel this leave request?";
    if (!confirm(message)) return;
    setActing(id);
    const result = await cancelLeave(id);
    setActing(null);
    result.success ? toast.success("Request cancelled") : toast.error(result.error);
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeFilter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No leave requests</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeFilter === "all" ? "No requests have been submitted yet." : `No ${activeFilter} requests.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Dates</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Days</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium">{req.employee_name}</p>
                      {req.exceeds_balance && (
                        <span title="Exceeds balance — requires manual review">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        </span>
                      )}
                    </div>
                    {req.reason && (
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{req.reason}</p>
                    )}
                    {req.ticket_number && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Ticket className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground font-mono">{req.ticket_number}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{req.policy_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {TYPE_LABELS[req.policy_type] ?? req.policy_type}
                      </p>
                      {req.comp_off_worked_date && (
                        <div className="mt-1 flex items-start gap-1 text-xs">
                          <Briefcase className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <div>
                            <p>Worked {formatWorkedDate(req.comp_off_worked_date)}</p>
                            <p
                              className={
                                req.comp_off_attendance === "No attendance recorded"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {req.comp_off_attendance}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {formatDate(req.start_date)} → {formatDate(req.end_date)}
                    <HalfDayMarker
                      startHalfDay={req.start_half_day}
                      endHalfDay={req.end_half_day}
                    />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell font-medium">
                    {Number(req.days)}d
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-3">
                    {(canApprove || req.status === "pending" || cancellable(req)) && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={acting === req.id}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content align="end" className="z-50 min-w-[140px] overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
                            {req.status === "pending" && canApprove && (
                              <>
                                <DropdownMenu.Item
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-success outline-none hover:bg-success/10"
                                  onSelect={() => handleApprove(req.id)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
                                  onSelect={() => handleReject(req.id)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                              </>
                            )}
                            {cancellable(req) && (
                              <DropdownMenu.Item
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                                onSelect={() => handleCancel(req)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                {req.status === "approved" ? "Cancel leave" : "Cancel"}
                              </DropdownMenu.Item>
                            )}
                            {req.status !== "pending" && !cancellable(req) && (
                              <DropdownMenu.Item className="px-2 py-1.5 text-xs text-muted-foreground cursor-default">
                                No actions available
                              </DropdownMenu.Item>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Marks which end(s) of a request are half days. The days column already reads
 * "2.5d"; this says whether the half sits at the start, the end, or both.
 */
function HalfDayMarker({
  startHalfDay, endHalfDay,
}: { startHalfDay: boolean | null; endHalfDay: boolean | null }) {
  const half = describeHalfDay(startHalfDay, endHalfDay);
  if (!half) return null;

  return (
    <span
      className="ml-1.5 inline-flex items-center rounded bg-muted px-1 text-xs font-medium text-foreground"
      title={half.label}
    >
      <span aria-hidden="true">{half.marker}</span>
      <span className="sr-only">{half.label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "warning" | "success" | "destructive" | "secondary" }> = {
    pending:   { label: "Pending",   variant: "warning" },
    approved:  { label: "Approved",  variant: "success" },
    rejected:  { label: "Rejected",  variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "secondary" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={variant}>{label}</Badge>;
}
