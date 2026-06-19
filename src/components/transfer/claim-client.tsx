"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptOwnershipTransfer, declineOwnershipTransfer } from "@/actions/ownership";
import { LATEST_POLICY_VERSION } from "@/config/legal";

export function ClaimClient({ token, orgName, inviterName }: { token: string; orgName: string; inviterName: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    if (!agreed) { toast.error("Please accept the terms to continue"); return; }
    setBusy(true);
    const res = await acceptOwnershipTransfer(token);
    setBusy(false);
    if (res.success) { toast.success(`You're now the owner of ${orgName}`); router.push("/dashboard"); }
    else toast.error(res.error);
  }
  async function onDecline() {
    setBusy(true);
    const res = await declineOwnershipTransfer(token);
    setBusy(false);
    if (res.success) { toast.success("Invitation declined"); router.push("/dashboard"); }
    else toast.error(res.error);
  }

  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border p-8">
      <h1 className="text-xl font-semibold">Become the owner of {orgName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inviterName} has invited you to take ownership of {orgName}. As owner you become the responsible account holder.
      </p>
      <label className="mt-6 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
        <span>
          I accept the{" "}
          <a href="/terms" target="_blank" className="text-primary underline">Terms</a> and{" "}
          <a href="/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>{" "}
          (version {LATEST_POLICY_VERSION}).
        </span>
      </label>
      <div className="mt-6 flex gap-2">
        <button disabled={busy || !agreed} onClick={onAccept} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Accept ownership
        </button>
        <button disabled={busy} onClick={onDecline} className="rounded-lg border px-4 py-2 text-sm">Decline</button>
      </div>
    </div>
  );
}
