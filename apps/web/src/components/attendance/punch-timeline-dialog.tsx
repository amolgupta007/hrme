"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listPunchEvents,
  addManualPunch,
  type PunchEventRow,
} from "@/actions/attendance-punches";
import { pairPunches } from "@/lib/attendance/pair-punches";
import { PunchTimelineRow, inferredType } from "./punch-timeline-row";
import { formatDate } from "@/lib/utils";

function fmtHrs(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function PunchTimelineDialog({
  open,
  onOpenChange,
  employeeId,
  date,
  employeeName,
  canApprove,
  canVoid,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  date: string;
  employeeName: string;
  canApprove: boolean;
  canVoid: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PunchEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTime, setNewTime] = useState(`${date}T09:00`);
  const [newType, setNewType] = useState<"in" | "out">("in");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listPunchEvents({ employeeId, date }).then((res) => {
      setLoading(false);
      if (res.success) setRows(res.data);
      else toast.error(res.error);
    });
  }, [open, employeeId, date]);

  const approved = rows.filter((r) => r.status === "approved");
  const paired = pairPunches(approved.map((r) => ({ id: r.id, punched_at: r.punched_at })));
  const hasPending = rows.some((r) => r.status === "pending");
  // Map each approved punch's id → its inferred display type by sequence.
  const typeById = new Map<string, "in" | "out" | "break_out" | "break_in">();
  approved.forEach((r, i) => typeById.set(r.id, inferredType(i)));

  async function submitAdd() {
    setBusy(true);
    const res = await addManualPunch({
      employeeId,
      punchedAtLocal: newTime,
      punchType: newType,
      note: null,
    });
    setBusy(false);
    if (res.success) {
      toast.success(res.data.status === "approved" ? "Punch added" : "Punch requested — pending approval");
      setAdding(false);
      const refreshed = await listPunchEvents({ employeeId, date });
      if (refreshed.success) setRows(refreshed.data);
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Punch timeline — {employeeName}</DialogTitle>
          <DialogDescription>{formatDate(date)}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span>
            Worked <strong>{fmtHrs(paired.workedMinutes)}</strong>
            {paired.breakMinutes > 0 && (
              <span className="text-muted-foreground"> · break {fmtHrs(paired.breakMinutes)}</span>
            )}
          </span>
          {(paired.needsReview || hasPending) && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {hasPending ? "Pending punches" : "Needs review"}
            </span>
          )}
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No punches for this day.</p>
          )}
          {rows.map((p) => (
            <PunchTimelineRow
              key={p.id}
              punch={p}
              displayType={typeById.get(p.id) ?? (p.punch_type ?? "in")}
              canApprove={canApprove}
              canVoid={canVoid}
              readOnly={readOnly}
            />
          ))}
        </div>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 self-start rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> {readOnly ? "Request missing punch" : "Add missing punch"}
          </button>
        )}
        {adding && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                className="rounded-md border px-2 py-1.5 text-sm"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value.slice(0, 16))}
              />
              <select
                className="rounded-md border px-2 py-1.5 text-sm"
                value={newType}
                onChange={(e) => setNewType(e.target.value as "in" | "out")}
              >
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? "Your request is submitted for admin approval and won't count until approved."
                : canApprove
                  ? "Added as an approved punch."
                  : "Submitted for approval."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="rounded-md border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                onClick={submitAdd}
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {readOnly ? "Submit request" : "Add punch"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
