"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { connectRazorpayX } from "@/actions/razorpayx-credentials";

interface Props {
  onClose: () => void;
}

export function RazorpayXConnectDialog({ onClose }: Props) {
  const router = useRouter();
  const [keyId, setKeyId] = React.useState("");
  const [keySecret, setKeySecret] = React.useState("");
  const [webhookSecret, setWebhookSecret] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [isTestMode, setIsTestMode] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Auto-toggle is_test_mode based on key_id prefix
  React.useEffect(() => {
    if (keyId.startsWith("rzp_live_")) setIsTestMode(false);
    else if (keyId.startsWith("rzp_test_")) setIsTestMode(true);
  }, [keyId]);

  async function handleSave() {
    if (!keyId.match(/^rzp_(test|live)_[A-Za-z0-9]+$/)) {
      toast.error("Invalid key_id (must start with rzp_test_ or rzp_live_)");
      return;
    }
    setSaving(true);
    const r = await connectRazorpayX({
      key_id: keyId.trim(),
      key_secret: keySecret.trim(),
      webhook_secret: webhookSecret.trim(),
      account_id: accountId.trim(),
      account_number: accountNumber.trim(),
      is_test_mode: isTestMode,
    });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success("RazorpayX connected. Run 'Test connection' to verify.");
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl space-y-3">
        <p className="text-sm font-semibold">Connect RazorpayX</p>
        <p className="text-xs text-muted-foreground">
          Paste API credentials from your RazorpayX dashboard → Settings → API Keys + Webhooks.
          Credentials are encrypted at rest. JambaHR never holds funds — money flows from YOUR
          RazorpayX wallet to YOUR employees.
        </p>

        <label className="block text-sm">
          <span className="block text-xs text-muted-foreground mb-1">Key ID</span>
          <input
            type="text"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="rzp_test_… or rzp_live_…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-muted-foreground mb-1">Key Secret</span>
          <input
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-muted-foreground mb-1">Webhook Secret</span>
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
          />
          <span className="block text-[10px] text-muted-foreground mt-1">
            Register webhook URL <code>https://jambahr.com/api/webhooks/razorpayx</code> in
            RazorpayX dashboard and copy the secret here.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block text-xs text-muted-foreground mb-1">Account ID</span>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="From RazorpayX dashboard"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-muted-foreground mb-1">Virtual Account Number</span>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Your RazorpayX wallet account"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isTestMode}
            onChange={(e) => setIsTestMode(e.target.checked)}
            disabled={keyId.startsWith("rzp_live_") || keyId.startsWith("rzp_test_")}
            className="h-4 w-4"
          />
          <span>
            <span className="font-medium">Test mode</span>
            <span className="block text-xs text-muted-foreground">
              Auto-detected from key prefix. No real money moves in test mode.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save & connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
