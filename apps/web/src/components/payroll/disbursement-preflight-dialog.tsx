"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Wallet, CheckCircle, AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  runPreflight,
  initiateDisbursement,
  type PreflightResult,
  type PreflightItem,
} from "@/actions/disbursement";
import { verifyEmployeeBeneficiary } from "@/actions/penny-drop";
import { formatINR } from "@/lib/ctc";

interface Props {
  runId: string;
  onClose: () => void;
  onInitiated: (batchId: string) => void;
}

function StatusBadge({ item }: { item: PreflightItem }) {
  if (item.blocking) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
        <AlertCircle className="h-3 w-3" /> Blocked
      </span>
    );
  }
  if (item.verification_status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <CheckCircle className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (item.verification_status === "name_mismatch") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" /> Name mismatch
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Unchecked
    </span>
  );
}

export function DisbursementPreflightDialog({ runId, onClose, onInitiated }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [preflight, setPreflight] = React.useState<PreflightResult | null>(null);
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);
  const [initiating, setInitiating] = React.useState(false);
  const [overrideShortfall, setOverrideShortfall] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const r = await runPreflight(runId);
    setLoading(false);
    if (!r.success) { toast.error(r.error); return; }
    setPreflight(r.data);
  }, [runId]);

  React.useEffect(() => { load(); }, [load]);

  async function handleReverify(employeeId: string) {
    setVerifyingId(employeeId);
    const r = await verifyEmployeeBeneficiary(employeeId, true);
    setVerifyingId(null);
    if (!r.success) { toast.error(r.error); return; }
    if (r.data.status === "verified") toast.success("Verified");
    else if (r.data.status === "name_mismatch") toast.warning("Name mismatch — admin must approve to proceed");
    else toast.error(`Verification ${r.data.status}: ${r.data.error_message ?? ""}`);
    // Reload preflight
    await load();
  }

  async function handleInitiate() {
    setInitiating(true);
    const r = await initiateDisbursement(runId, { override_wallet_shortfall: overrideShortfall });
    setInitiating(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Batch initiated. Awaiting approval.");
    onInitiated(r.data.batch_id);
    router.refresh();
  }

  const canInitiate = preflight && preflight.blocking_count === 0 && (preflight.shortfall == null || preflight.shortfall <= 0 || overrideShortfall);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-background p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Pre-flight — RazorpayX Disbursement</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading || !preflight ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running preflight…
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div className="rounded-md bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Total payable</p>
                <p className="text-lg font-semibold tabular-nums">{formatINR(preflight.total_payable)}</p>
              </div>
              <div className="rounded-md bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Wallet balance</p>
                <p className="text-lg font-semibold tabular-nums">
                  {preflight.wallet_balance != null ? formatINR(preflight.wallet_balance) : "Unknown"}
                </p>
              </div>
            </div>

            {preflight.shortfall != null && preflight.shortfall > 0 && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                <p className="font-semibold">Wallet shortfall: {formatINR(preflight.shortfall)}</p>
                <p className="mt-1">Fund your RazorpayX wallet before initiating, OR override at your own risk.</p>
                <label className="mt-2 inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={overrideShortfall}
                    onChange={(e) => setOverrideShortfall(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span>Proceed anyway (audit-logged)</span>
                </label>
              </div>
            )}

            {preflight.blocking_count > 0 && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                <p className="font-semibold">{preflight.blocking_count} employee(s) blocked</p>
                <p>Fix bank details or beneficiary sync before initiating.</p>
              </div>
            )}

            {/* Items table */}
            <div className="rounded-md border border-border overflow-x-auto mb-4">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Employee</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Bank</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preflight.items.map((it) => (
                    <tr key={it.employee_id} className="border-t border-border">
                      <td className="px-3 py-2">{it.employee_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(it.amount)}</td>
                      <td className="px-3 py-2">
                        {it.bank_account_last4
                          ? <span className="font-mono">{it.bank_account_ifsc_first4 ?? "????"} ····{it.bank_account_last4}</span>
                          : <span className="text-red-600">No bank</span>}
                      </td>
                      <td className="px-3 py-2"><StatusBadge item={it} /></td>
                      <td className="px-3 py-2 text-right">
                        {it.fund_account_id && (
                          <Button size="sm" variant="ghost" onClick={() => handleReverify(it.employee_id)} disabled={verifyingId === it.employee_id}>
                            <RefreshCw className={`h-3 w-3 ${verifyingId === it.employee_id ? "animate-spin" : ""}`} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onClose} disabled={initiating}>Cancel</Button>
              <Button size="sm" onClick={handleInitiate} disabled={!canInitiate || initiating}>
                {initiating ? "Initiating…" : "Initiate batch"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Initiating creates the batch in awaiting-approval state. A different admin (maker-checker) must approve before money moves.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
