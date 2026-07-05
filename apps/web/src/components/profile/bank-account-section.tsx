"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Landmark, Pencil, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { upsertMyBankAccount, type MaskedBankAccount } from "@/actions/employee-bank-accounts";

interface Props {
  initial: MaskedBankAccount | null;
}

function SyncBadge({ status, error }: { status: MaskedBankAccount["beneficiary_sync_status"]; error: string | null }) {
  const map = {
    pending: { Icon: Clock, label: "Sync pending", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
    synced: { Icon: CheckCircle, label: "Verified with RazorpayX", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
    failed: { Icon: AlertCircle, label: error ? `Sync failed: ${error}` : "Sync failed", cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400" },
  };
  const { Icon, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />{label}
    </span>
  );
}

export function BankAccountSection({ initial }: Props) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!initial);
  const [saving, setSaving] = React.useState(false);
  const [holderName, setHolderName] = React.useState(initial?.holder_name ?? "");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [ifsc, setIfsc] = React.useState("");
  const [accountType, setAccountType] = React.useState<"savings" | "current">(initial?.account_type ?? "savings");

  async function handleSave() {
    if (!holderName.trim()) { toast.error("Holder name required"); return; }
    if (!/^\d{9,18}$/.test(accountNumber)) { toast.error("Account number must be 9-18 digits"); return; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) { toast.error("Invalid IFSC (e.g. FDRL0001234)"); return; }

    setSaving(true);
    const r = await upsertMyBankAccount({
      holder_name: holderName.trim(),
      account_number: accountNumber,
      ifsc: ifsc.toUpperCase(),
      account_type: accountType,
    });
    setSaving(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Bank account saved. Beneficiary sync queued.");
    setAccountNumber("");
    setIfsc("");
    setEditing(false);
    router.refresh();
  }

  return (
    <section id="bank-account" className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Landmark className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Bank Account</h3>
            <p className="text-xs text-muted-foreground">Used for salary disbursement.</p>
          </div>
        </div>
        {initial && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>

      {initial && !editing && (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-xs text-muted-foreground">Holder name</span>
              <span className="font-medium">{initial.holder_name}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">Account type</span>
              <span className="font-medium capitalize">{initial.account_type}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">Account number</span>
              <span className="font-mono">••••{initial.account_number_last4}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">IFSC</span>
              <span className="font-mono">{initial.ifsc_first4}xxxxxxx</span>
            </div>
          </div>
          <div className="pt-2">
            <SyncBadge status={initial.beneficiary_sync_status} error={initial.beneficiary_sync_error} />
          </div>
        </div>
      )}

      {(editing || !initial) && (
        <div className="space-y-3 text-sm">
          {!initial && (
            <p className="text-xs text-muted-foreground">
              Add your bank account to receive salary directly. Your bank details are encrypted at rest and visible only to you and your admin.
            </p>
          )}
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Account holder name</span>
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
              <span className="block text-xs text-muted-foreground mb-1">IFSC code</span>
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
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : initial ? "Update bank account" : "Add bank account"}
            </Button>
            {initial && (
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setAccountNumber(""); setIfsc(""); }} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
          {initial && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              For your protection, re-enter the full account number and IFSC even when editing only the holder name.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
