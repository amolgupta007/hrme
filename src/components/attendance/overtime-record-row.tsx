"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveOvertime, rejectOvertime, type OvertimeRecord } from "@/actions/overtime";

interface Props {
  record: OvertimeRecord;
  isAdmin: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

export function OvertimeRecordRow({ record, isAdmin, selected, onToggleSelect }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [reason, setReason] = React.useState("");

  async function handleApprove() {
    setBusy(true);
    const r = await approveOvertime(record.id);
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Approved");
    router.refresh();
  }
  async function handleReject() {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    setBusy(true);
    const r = await rejectOvertime(record.id, reason);
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Rejected");
    setShowRejectInput(false);
    setReason("");
    router.refresh();
  }

  const statusBadge = {
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    rejected: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    pushed: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  }[record.status];

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20">
      <div className="flex items-center gap-3 min-w-0">
        {isAdmin && record.status === "pending" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(record.id)}
            className="h-4 w-4"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{record.employee_name}</p>
          <p className="text-xs text-muted-foreground">
            {record.date} · {record.shift_name ?? "—"} · {formatMinutes(record.ot_minutes)} OT · {record.multiplier}x
          </p>
          {record.rejected_reason && (
            <p className="text-xs text-red-600 mt-0.5">Rejected: {record.rejected_reason}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge}`}>{record.status}</span>
        {isAdmin && record.status === "pending" && !showRejectInput && (
          <>
            <Button size="sm" variant="ghost" onClick={handleApprove} disabled={busy}>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRejectInput(true)} disabled={busy}>
              <XCircle className="h-3.5 w-3.5 text-red-600" />
            </Button>
          </>
        )}
        {isAdmin && showRejectInput && (
          <>
            <input
              type="text"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-7 w-32 rounded-md border border-input bg-background px-2 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={handleReject} disabled={busy}>Reject</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowRejectInput(false); setReason(""); }}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
