"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Reopening a processed month unlocks it for corrections. Allowed only before
 * any payout starts; the reason goes into the payroll change log.
 */
export function ReopenRunDialog({
  month,
  onClose,
  onConfirm,
}: {
  month: string;
  onClose: () => void;
  /** Returns an error message, or null on success. */
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const err = await onConfirm(reason.trim());
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {month}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            The month goes back to draft so you can correct it, recalculate and process it again. This is only possible
            before any payout has started; after that, corrections go into a later month as an adjustment.
          </p>
          <div>
            <label htmlFor="reopen-reason" className="font-medium">Why are you reopening it?</label>
            <textarea
              id="reopen-reason"
              className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rahul's unpaid leave was approved late"
            />
          </div>
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-9 px-3 text-sm text-muted-foreground">Cancel</button>
            <button
              onClick={confirm}
              disabled={busy || reason.trim().length < 3}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reopen month
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
