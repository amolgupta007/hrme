"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDisbursementBatchByRun, retryFailedPayouts } from "@/actions/disbursement";
import { ApproveDisbursementDialog } from "./approve-disbursement-dialog";
import { DisbursementItemRow } from "./disbursement-item-row";
import { formatINR } from "@/lib/ctc";

interface Props {
  runId: string;
}

export function DisbursementTab({ runId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [batch, setBatch] = React.useState<any | null>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [retrying, setRetrying] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);

  async function load() {
    setLoading(true);
    const r = await getDisbursementBatchByRun(runId);
    setLoading(false);
    if (!r.success) { toast.error(r.error); return; }
    setBatch(r.data?.batch ?? null);
    setItems(r.data?.items ?? []);
  }

  React.useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [runId]);

  async function handleRetry() {
    if (!batch) return;
    setRetrying(true);
    const r = await retryFailedPayouts(batch.id);
    setRetrying(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`Retried ${r.data.retried}: ${r.data.succeeded} OK, ${r.data.still_failed} still failed`);
    router.refresh();
    load();
  }

  function downloadCsv() {
    if (!items.length) return;
    const headers = ["Employee", "Amount", "Status", "RazorpayX Payout ID", "Failure"];
    const rows = items.map((it) => [
      it.employees ? `${it.employees.first_name} ${it.employees.last_name}` : "Unknown",
      it.amount,
      it.status,
      it.razorpayx_payout_id ?? "",
      it.failure_reason ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disbursement-${runId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading disbursement…</p>;
  }
  if (!batch) {
    return (
      <div className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">
        No disbursement batch for this run. Click &quot;Pay Now via RazorpayX&quot; to initiate.
      </div>
    );
  }

  const paidCount = items.filter((i) => i.status === "paid").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const totalFees = batch.total_fees_paise ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold">Batch · {batch.status}</p>
            <p className="text-xs text-muted-foreground">
              Initiated {new Date(batch.initiated_at).toLocaleString("en-IN")}
              {batch.approved_at && ` · Approved ${new Date(batch.approved_at).toLocaleString("en-IN")}`}
              {batch.razorpayx_batch_id && ` · RazorpayX batch ${batch.razorpayx_batch_id.slice(-10)}`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="font-semibold tabular-nums">{formatINR(batch.total_amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Paid / Failed</p>
              <p className="font-semibold">
                <span className="text-emerald-600">{paidCount}</span>
                {" / "}
                <span className={failedCount > 0 ? "text-red-600" : ""}>{failedCount}</span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fees</p>
              <p className="font-semibold tabular-nums">{totalFees > 0 ? formatINR(totalFees / 100) : "—"}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          {batch.status === "awaiting_approval" && (
            <Button size="sm" onClick={() => setApproveOpen(true)}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve &amp; Pay
            </Button>
          )}
          {failedCount > 0 && batch.status !== "cancelled" && (
            <Button size="sm" variant="ghost" onClick={handleRetry} disabled={retrying}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrying…" : `Retry ${failedCount} failed`}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Employee</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Fee</th>
              <th className="text-left px-3 py-2">Payout ID</th>
              <th className="text-left px-3 py-2">Failure</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => <DisbursementItemRow key={it.id} item={it} />)}
          </tbody>
        </table>
      </div>

      {approveOpen && (
        <ApproveDisbursementDialog
          batchId={batch.id}
          totalAmount={batch.total_amount}
          itemCount={items.length}
          makerName={null /* maker name not in batch payload yet; consider joining */}
          onClose={() => {
            setApproveOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
