"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Landmark, CheckCircle, AlertCircle, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getEmployeeBankAccount,
  upsertEmployeeBankAccount,
  type MaskedBankAccount,
} from "@/actions/employee-bank-accounts";

interface Props {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}

export function EmployeeBankAccountDialog({ open, employeeId, employeeName, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [current, setCurrent] = React.useState<MaskedBankAccount | null>(null);
  const [holderName, setHolderName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [ifsc, setIfsc] = React.useState("");
  const [accountType, setAccountType] = React.useState<"savings" | "current">("savings");

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setCurrent(null);
    setHolderName("");
    setAccountNumber("");
    setIfsc("");
    setAccountType("savings");
    getEmployeeBankAccount(employeeId).then((r) => {
      if (cancelled) return;
      if (r.success && r.data) {
        setCurrent(r.data);
        setHolderName(r.data.holder_name);
        setAccountType(r.data.account_type);
      } else if (!r.success) {
        toast.error(r.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId]);

  async function handleSave() {
    if (!holderName.trim()) {
      toast.error("Holder name required");
      return;
    }
    if (!/^\d{9,18}$/.test(accountNumber)) {
      toast.error("Account number must be 9-18 digits");
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
      toast.error("Invalid IFSC (e.g. FDRL0001234)");
      return;
    }
    setSaving(true);
    const r = await upsertEmployeeBankAccount(employeeId, {
      holder_name: holderName.trim(),
      account_number: accountNumber,
      ifsc: ifsc.toUpperCase(),
      account_type: accountType,
    });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success(`Bank account saved for ${employeeName}. Beneficiary sync queued.`);
    router.refresh();
    onClose();
  }

  const syncBadge = current
    ? (() => {
        const map = {
          pending: {
            Icon: Clock,
            label: "Sync pending",
            cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
          },
          synced: {
            Icon: CheckCircle,
            label: "Verified",
            cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
          },
          failed: {
            Icon: AlertCircle,
            label: current.beneficiary_sync_error
              ? `Failed: ${current.beneficiary_sync_error}`
              : "Failed",
            cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
          },
        };
        return map[current.beneficiary_sync_status];
      })()
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-xl animate-in fade-in-0 zoom-in-95 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Landmark className="h-4 w-4 text-primary" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold">Bank Account</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  {employeeName}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              {current && (
                <div className="rounded-md bg-muted/40 p-3 text-xs space-y-2">
                  <p className="font-medium text-muted-foreground">Current</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Holder</span>
                      <span className="font-medium">{current.holder_name}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Type</span>
                      <span className="font-medium capitalize">{current.account_type}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground">Account #</span>
                      <span className="font-mono">••••{current.account_number_last4}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground">IFSC</span>
                      <span className="font-mono">{current.ifsc_first4}xxxxxxx</span>
                    </div>
                  </div>
                  {syncBadge && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${syncBadge.cls}`}
                    >
                      <syncBadge.Icon className="h-3 w-3" />
                      {syncBadge.label}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">Holder name</span>
                  <input
                    type="text"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs text-muted-foreground mb-1">Account number</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="9-18 digits"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-muted-foreground mb-1">IFSC</span>
                    <input
                      type="text"
                      placeholder="e.g. FDRL0001234"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono uppercase"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">Account type</span>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as "savings" | "current")}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                  >
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </select>
                </label>
                {current && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Re-enter the full account number and IFSC even if only the holder name is changing — fields are never decrypted client-side.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving…" : current ? "Update" : "Add bank account"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
