"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MinusCircle } from "lucide-react";
import { overrideLateFlag } from "@/actions/late-policy";
import { formatCurrency } from "@/lib/utils";

/**
 * Payroll-row chip showing the graduated late-penalty deduction applied to an
 * entry, with an admin "Waive" action that overrides the month's late flag
 * (clears both the salary deduction and any bonus block on next recompute).
 */
export function LatePenaltyChip({
  employeeId,
  month,
  penaltyDays,
  amount,
  onWaived,
}: {
  employeeId: string;
  month: string;
  penaltyDays: number;
  amount: number;
  onWaived?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (amount <= 0) return null;

  async function doWaive() {
    if (!reason.trim()) return toast.error("Reason required");
    setBusy(true);
    const res = await overrideLateFlag({ employeeId, month, reason });
    setBusy(false);
    if (res.success) {
      toast.success("Penalty waived — reprocess or re-edit the entry to clear it");
      setOpen(false);
      onWaived?.();
    } else toast.error(res.error);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800"
        title="Waive late penalty"
      >
        <MinusCircle className="h-3 w-3" /> Late penalty · {penaltyDays} day
        {penaltyDays === 1 ? "" : "s"} ({formatCurrency(amount)})
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div className="w-96 rounded-lg bg-background p-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold">Waive late penalty</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              This deducts {penaltyDays} day{penaltyDays === 1 ? "" : "s"} of salary (
              {formatCurrency(amount)}). Enter a reason to waive it for this month.
            </p>
            <textarea
              className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                onClick={doWaive}
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                Waive penalty
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
