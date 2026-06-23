"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payContractors } from "@/actions/contractors";
import { computeContractorTDS } from "@/lib/contractor/tds";
import type { ContractorEngagement } from "./contractors-client";

interface PayContractorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagements: ContractorEngagement[];
}

interface PayRow {
  engagement_id: string;
  employee_name: string;
  tds_section: ContractorEngagement["tds_section"];
  payee_type: ContractorEngagement["payee_type"];
  has_pan: boolean;
  bank_verified: boolean;
  gross: string; // string so input is controlled freely
}

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function PayContractorsDialog({
  open,
  onOpenChange,
  engagements,
}: PayContractorsDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  // Initialise one row per active engagement
  const [rows, setRows] = React.useState<PayRow[]>([]);

  React.useEffect(() => {
    if (open) {
      setRows(
        engagements.map((eng) => ({
          engagement_id: eng.id,
          employee_name: eng.employee_name,
          tds_section: eng.tds_section,
          payee_type: eng.payee_type,
          has_pan: eng.has_pan,
          bank_verified: eng.bank_verified,
          gross: "",
        }))
      );
    }
  }, [open, engagements]);

  function setGross(idx: number, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, gross: value } : r))
    );
  }

  // Compute preview for a row
  function previewRow(row: PayRow) {
    const gross = parseFloat(row.gross);
    if (isNaN(gross) || gross <= 0) return null;
    const result = computeContractorTDS({
      amount: gross,
      section: row.tds_section,
      payeeType: row.payee_type,
      hasPan: row.has_pan,
    });
    return {
      gross,
      tds: result.tds,
      net: Math.max(0, gross - result.tds),
      ratePct: result.ratePct,
      reason: result.reason,
    };
  }

  // Rows with a valid gross amount
  const filledRows = rows.filter((r) => {
    const g = parseFloat(r.gross);
    return !isNaN(g) && g > 0;
  });

  // Any unverified contractor in the filled set blocks submission
  const unverifiedInFilled = filledRows.filter((r) => !r.bank_verified);

  const canSubmit =
    filledRows.length > 0 &&
    unverifiedInFilled.length === 0 &&
    !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    const items = filledRows.map((r) => ({
      engagement_id: r.engagement_id,
      gross_amount: parseFloat(r.gross),
    }));

    const result = await payContractors({ items });
    setLoading(false);

    if (result.success) {
      toast.success("Payment batch created — awaiting approval");
      onOpenChange(false);
      // Route to disbursement batch detail for maker-checker approval.
      router.push(`/dashboard/payroll?tab=disbursements&batch=${result.data.batchId}`);
    } else {
      toast.error(result.error);
    }
  }

  // Totals
  const totals = filledRows.reduce(
    (acc, row) => {
      const p = previewRow(row);
      if (!p) return acc;
      return {
        gross: acc.gross + p.gross,
        tds: acc.tds + p.tds,
        net: acc.net + p.net,
      };
    },
    { gross: 0, tds: 0, net: 0 }
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              Pay Contractors
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <p className="mb-5 text-sm text-muted-foreground">
            Enter the gross payment amount for each contractor. TDS is computed
            live. Leave blank to skip a contractor this cycle.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {rows.map((row, idx) => {
                const preview = previewRow(row);
                const hasGross = parseFloat(row.gross) > 0 && !isNaN(parseFloat(row.gross));
                return (
                  <div
                    key={row.engagement_id}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{row.employee_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.tds_section} ·{" "}
                          {row.payee_type === "individual_huf"
                            ? "Individual / HUF"
                            : "Other"}{" "}
                          · {row.has_pan ? "PAN available" : "No PAN — §206AA"}
                        </p>
                      </div>
                      {!row.bank_verified && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          <AlertCircle className="h-3 w-3" />
                          Bank unverified
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Gross Amount (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={inputCn}
                          value={row.gross}
                          onChange={(e) => setGross(idx, e.target.value)}
                          placeholder="Leave blank to skip"
                        />
                      </div>

                      {hasGross && preview && (
                        <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Gross</span>
                            <span className="font-medium">{formatINR(preview.gross)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              TDS ({preview.reason})
                            </span>
                            <span className="text-destructive font-medium">
                              − {formatINR(preview.tds)}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-1">
                            <span className="font-medium">Net payout</span>
                            <span className="font-semibold text-emerald-700">
                              {formatINR(preview.net)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {!row.bank_verified && hasGross && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Verify this contractor&apos;s bank account (penny-drop) on the
                        employee bank screen before paying.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary totals */}
            {filledRows.length > 0 && (
              <div className="mt-5 rounded-lg bg-muted/40 p-4 text-sm">
                <p className="mb-2 font-medium">Batch summary ({filledRows.length} contractor{filledRows.length !== 1 ? "s" : ""})</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total gross</span>
                    <span>{formatINR(totals.gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total TDS</span>
                    <span className="text-destructive">− {formatINR(totals.tds)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Total net payout</span>
                    <span className="text-emerald-700">{formatINR(totals.net)}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Batch will be created in{" "}
                  <span className="font-medium">awaiting_approval</span> status. A
                  second admin must approve before disbursement (maker-checker).
                </p>
              </div>
            )}

            {/* Unverified warning (blocks submit) */}
            {unverifiedInFilled.length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {unverifiedInFilled.map((r) => r.employee_name).join(", ")}{" "}
                  {unverifiedInFilled.length === 1 ? "has" : "have"} an unverified
                  bank account. Verify via penny-drop first.
                </span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading
                  ? "Creating batch..."
                  : `Submit ${filledRows.length > 0 ? `(${filledRows.length})` : ""}`}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
