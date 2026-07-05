"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  computeAndRecordOvertime,
  bulkApproveOvertime,
  pushOvertimeToPayroll,
  type OvertimeRecord,
} from "@/actions/overtime";
import type { OvertimeSettings } from "@/lib/attendance/overtime-types";
import { OvertimeRecordRow } from "./overtime-record-row";

interface Props {
  records: OvertimeRecord[];
  settings: OvertimeSettings;
  isAdmin: boolean;
}

function defaultWeekRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dayOfWeek = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

function currentMonth(): string {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function OvertimeTab({ records, settings, isAdmin }: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<"all" | "pending" | "approved" | "rejected" | "pushed">("all");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [month, setMonth] = React.useState(currentMonth());
  const [busy, setBusy] = React.useState(false);

  const filtered = statusFilter === "all" ? records : records.filter((r) => r.status === statusFilter);
  const pendingCount = records.filter((r) => r.status === "pending").length;
  const approvedCount = records.filter((r) => r.status === "approved").length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleComputeWeek() {
    const { from, to } = defaultWeekRange();
    setBusy(true);
    const r = await computeAndRecordOvertime({ from, to });
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`Inserted ${r.data.inserted}, skipped ${r.data.skipped}`);
    router.refresh();
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) { toast.error("Select at least one record"); return; }
    setBusy(true);
    const r = await bulkApproveOvertime([...selectedIds]);
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`Approved ${r.data.approved}`);
    setSelectedIds(new Set());
    router.refresh();
  }

  async function handlePush() {
    if (!month) { toast.error("Pick a month"); return; }
    setBusy(true);
    const r = await pushOvertimeToPayroll({ month });
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`Pushed ${r.data.pushed} to ${month} payroll, skipped ${r.data.skipped}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="all">All ({records.length})</option>
            <option value="pending">Pending ({pendingCount})</option>
            <option value="approved">Approved ({approvedCount})</option>
            <option value="rejected">Rejected</option>
            <option value="pushed">Pushed</option>
          </select>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={handleComputeWeek} disabled={busy}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Compute OT this week
            </Button>
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={handleBulkApprove} disabled={busy}>
                Approve {selectedIds.size} selected
              </Button>
            )}
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
            <Button size="sm" onClick={handlePush} disabled={busy}>
              <Send className="h-3.5 w-3.5 mr-1" /> Push approved OT to {month}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">No OT records {statusFilter !== "all" ? `with status "${statusFilter}"` : "yet"}.</p>
          </div>
        ) : (
          filtered.map((rec) => (
            <OvertimeRecordRow
              key={rec.id}
              record={rec}
              isAdmin={isAdmin}
              selected={selectedIds.has(rec.id)}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>

      {!settings.enabled && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Overtime is currently disabled. Existing records remain visible. Re-enable in Settings → Attendance → Overtime to compute or push new OT.
        </p>
      )}
    </div>
  );
}
