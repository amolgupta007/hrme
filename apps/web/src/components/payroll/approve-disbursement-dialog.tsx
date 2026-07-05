"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveDisbursement } from "@/actions/disbursement";
import { formatINR } from "@/lib/ctc";

interface Props {
  batchId: string;
  totalAmount: number; // rupees
  itemCount: number;
  makerName: string | null;
  onClose: () => void;
}

export function ApproveDisbursementDialog({ batchId, totalAmount, itemCount, makerName, onClose }: Props) {
  const router = useRouter();
  const [approving, setApproving] = React.useState(false);

  async function handleApprove() {
    setApproving(true);
    const r = await approveDisbursement(batchId);
    setApproving(false);
    if (!r.success) { toast.error(r.error); return; }
    if (r.data.failed > 0) {
      toast.error(`Approved. ${r.data.pushed} pushed, ${r.data.failed} failed. Check reconciliation tab.`);
    } else {
      toast.success(`Approved. ${r.data.pushed} payouts queued at RazorpayX.`);
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Approve Disbursement</p>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <p>Initiated by: <strong>{makerName ?? "Unknown"}</strong></p>
          <p>Employees to pay: <strong>{itemCount}</strong></p>
          <p>Total amount: <strong className="tabular-nums">{formatINR(totalAmount)}</strong></p>
          <p className="text-xs text-amber-700 dark:text-amber-400 pt-2">
            Approving will trigger real payouts via RazorpayX from your wallet to {itemCount} employee bank account(s). This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={approving}>Cancel</Button>
          <Button size="sm" onClick={handleApprove} disabled={approving}>
            {approving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Approving…</> : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Approve & Pay</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
