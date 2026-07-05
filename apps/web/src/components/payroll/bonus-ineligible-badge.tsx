"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { overrideLateFlag } from "@/actions/late-policy";

export function BonusIneligibleBadge({
  employeeId,
  month,
  lateDays,
  status,
  onOverridden,
}: {
  employeeId: string;
  month: string;
  lateDays: number;
  status: "flagged" | "overridden";
  onOverridden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "overridden") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Bonus override applied</span>;
  }

  async function doOverride() {
    if (!reason.trim()) return toast.error("Reason required");
    setBusy(true);
    const res = await overrideLateFlag({ employeeId, month, reason });
    setBusy(false);
    if (res.success) { toast.success("Override applied"); setOpen(false); onOverridden?.(); }
    else toast.error(res.error);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        <AlertCircle className="h-3 w-3" /> Bonus-ineligible · {lateDays} late days
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-96 rounded-lg bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">Override bonus block</h4>
            <p className="mt-1 text-sm text-muted-foreground">This employee hit {lateDays} late days this month. Enter a reason to allow a bonus.</p>
            <textarea className="mt-2 w-full rounded-md border px-3 py-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={doOverride} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Apply override</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
