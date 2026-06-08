"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Wallet, CheckCircle, AlertCircle, RefreshCw, Plug, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disconnectRazorpayX,
  testRazorpayXConnection,
  setSinglePersonApproval,
  type MaskedRazorpayXCredentials,
} from "@/actions/razorpayx-credentials";
import { RazorpayXConnectDialog } from "./razorpayx-connect-dialog";

interface Props {
  credentials: MaskedRazorpayXCredentials | null;
}

export function RazorpayXCard({ credentials }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  async function handleTest() {
    setTesting(true);
    const r = await testRazorpayXConnection();
    setTesting(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    if (r.data.ok) toast.success("RazorpayX connection OK");
    else toast.error(`Connection failed: ${r.data.error}`);
    router.refresh();
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect RazorpayX? You'll need to re-enter credentials to use online payouts again.",
      )
    )
      return;
    const r = await disconnectRazorpayX();
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success("RazorpayX disconnected");
    router.refresh();
  }

  async function toggleSinglePerson(allowed: boolean) {
    const r = await setSinglePersonApproval(allowed);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success(
      allowed ? "Single-person approval enabled" : "Two-person approval required",
    );
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-indigo-100 dark:bg-indigo-950 p-2 shrink-0">
          <Wallet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">RazorpayX Disbursement</p>
          <p className="text-xs text-muted-foreground">
            Pay employees directly from your RazorpayX wallet.
          </p>
        </div>
        {credentials?.is_test_mode && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            Test mode
          </span>
        )}
      </div>

      {!credentials ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Not connected. Connect to enable Pay Now on processed payroll runs.
            <a
              href="https://razorpay.com/x"
              target="_blank"
              rel="noreferrer"
              className="underline ml-1"
            >
              Learn how to set up RazorpayX →
            </a>
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plug className="h-3.5 w-3.5 mr-1" /> Connect RazorpayX
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="block text-muted-foreground">Key ID</span>
              <span className="font-mono">{credentials.key_id_masked}</span>
            </div>
            <div>
              <span className="block text-muted-foreground">Virtual A/C</span>
              <span className="font-mono">{credentials.account_number_masked}</span>
            </div>
            <div>
              <span className="block text-muted-foreground">Account ID</span>
              <span className="font-mono">{credentials.account_id}</span>
            </div>
            <div>
              <span className="block text-muted-foreground">Connected by</span>
              <span>{credentials.connected_by_name ?? "—"}</span>
            </div>
          </div>

          {credentials.last_test_at && (
            <div className="flex items-center gap-1.5 text-xs">
              {credentials.last_test_ok ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-red-600" />
              )}
              <span className="text-muted-foreground">
                Last test: {new Date(credentials.last_test_at).toLocaleString("en-IN")}
              </span>
              {credentials.last_test_error && (
                <span className="text-red-600"> · {credentials.last_test_error}</span>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={credentials.single_person_approval_allowed}
              onChange={(e) => toggleSinglePerson(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              <span className="font-medium">Allow single-person approval</span>
              <span className="block text-xs text-muted-foreground">
                If unchecked, a different admin must approve each batch (recommended).
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleTest} disabled={testing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${testing ? "animate-spin" : ""}`} />
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisconnect}>
              <Unplug className="h-3.5 w-3.5 mr-1" /> Disconnect
            </Button>
          </div>
        </div>
      )}

      {open && <RazorpayXConnectDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
