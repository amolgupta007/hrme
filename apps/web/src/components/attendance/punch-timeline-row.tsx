"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Coffee, Cpu, PencilLine, Smartphone, Ban, Check, X } from "lucide-react";
import {
  approvePunch,
  rejectPunch,
  voidPunch,
  type PunchEventRow,
} from "@/actions/attendance-punches";

/** IST HH:MM of a UTC ISO instant (server-tz-independent). */
export function istTime(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
}

/** Derive a display direction for a punch by its sequence position (0-based, approved only). */
export function inferredType(index: number): "in" | "out" | "break_out" | "break_in" {
  if (index === 0) return "in";
  if (index % 2 === 1) return "out";
  return "in";
}

function typeVisual(t: "in" | "out" | "break_out" | "break_in") {
  switch (t) {
    case "in":
      return { icon: LogIn, cls: "text-emerald-600", label: "In" };
    case "out":
      return { icon: LogOut, cls: "text-rose-600", label: "Out" };
    default:
      return { icon: Coffee, cls: "text-amber-600", label: t === "break_out" ? "Break out" : "Break in" };
  }
}

export function PunchTimelineRow({
  punch,
  displayType,
  canApprove,
  canVoid,
  readOnly,
}: {
  punch: PunchEventRow;
  displayType: "in" | "out" | "break_out" | "break_in";
  canApprove: boolean;
  canVoid: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const t = punch.punch_type ?? displayType;
  const { icon: Icon, cls, label } = typeVisual(t);

  const isManual = punch.source === "manual";
  const isMobile = punch.source === "mobile";
  const dimmed = punch.status === "voided" || punch.status === "rejected" || punch.status === "duplicate";

  async function act(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.success) {
      toast.success(ok);
      router.refresh();
    } else toast.error(res.error);
  }

  function withReason(promptText: string, run: (reason: string) => Promise<any>) {
    const reason = window.prompt(promptText)?.trim();
    if (!reason) return;
    void act(() => run(reason), "Done");
  }

  return (
    <div
      className={`flex items-center justify-between rounded-md border px-3 py-2 ${
        dimmed ? "opacity-50" : ""
      } ${punch.status === "pending" ? "border-dashed border-amber-400 bg-amber-50/40" : ""}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 ${cls}`} />
        <div>
          <p className={`font-mono text-sm ${dimmed ? "line-through" : ""}`}>
            {istTime(punch.punched_at)} <span className="text-xs text-muted-foreground">· {label}</span>
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {isManual ? (
                <PencilLine className="h-3 w-3" />
              ) : isMobile ? (
                <Smartphone className="h-3 w-3" />
              ) : (
                <Cpu className="h-3 w-3" />
              )}
              {isManual ? "Manual" : isMobile ? "Mobile" : punch.source === "web" ? "Web" : "Device"}
            </span>
            {punch.status === "pending" && <span className="text-amber-700">Awaiting approval</span>}
            {punch.status === "voided" && <span title={punch.void_reason ?? ""}>Voided</span>}
            {punch.status === "rejected" && <span title={punch.rejection_reason ?? ""}>Rejected</span>}
            {punch.status === "duplicate" && <span>Duplicate</span>}
          </div>
          {punch.note && (
            <p className="mt-0.5 max-w-64 truncate text-[11px] italic text-muted-foreground" title={punch.note}>
              &ldquo;{punch.note}&rdquo;
            </p>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-1">
          {punch.status === "pending" && canApprove && (
            <>
              <button
                disabled={busy}
                onClick={() => act(() => approvePunch(punch.id), "Approved")}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
              >
                <Check className="h-3 w-3" /> Approve
              </button>
              <button
                disabled={busy}
                onClick={() => withReason("Reason for rejecting this punch:", (r) => rejectPunch(punch.id, r))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
              >
                <X className="h-3 w-3" /> Reject
              </button>
            </>
          )}
          {punch.status === "approved" && canVoid && (
            <button
              disabled={busy}
              onClick={() => withReason("Reason for voiding this punch:", (r) => voidPunch(punch.id, r))}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Ban className="h-3 w-3" /> Void
            </button>
          )}
        </div>
      )}
    </div>
  );
}
