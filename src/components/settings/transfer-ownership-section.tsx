"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  initiateOwnershipTransfer,
  getActiveOwnershipTransfer,
  cancelOwnershipTransfer,
  resendOwnershipTransfer,
} from "@/actions/ownership";

type Pending = { id: string; to_email: string | null; to_phone: string | null; expires_at: string } | null;

export function TransferOwnershipSection() {
  const [pending, setPending] = useState<Pending>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await getActiveOwnershipTransfer();
    if (res.success) setPending(res.data);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function onInitiate() {
    if (!email.trim() && !phone.trim()) { toast.error("Enter an email or phone"); return; }
    setBusy(true);
    const res = await initiateOwnershipTransfer({ email: email.trim() || undefined, phone: phone.trim() || undefined, name: name.trim() || undefined });
    setBusy(false);
    if (res.success) { toast.success("Ownership invite sent"); setEmail(""); setPhone(""); setName(""); refresh(); }
    else toast.error(res.error);
  }
  async function onCancel() {
    setBusy(true); const res = await cancelOwnershipTransfer(); setBusy(false);
    if (res.success) { toast.success("Transfer cancelled"); refresh(); } else toast.error(res.error);
  }
  async function onResend() {
    setBusy(true); const res = await resendOwnershipTransfer(); setBusy(false);
    if (res.success) toast.success("Invite resent"); else toast.error(res.error);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (pending) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm">
          Ownership transfer to <strong>{pending.to_email ?? pending.to_phone}</strong> — awaiting acceptance
          (expires {new Date(pending.expires_at).toLocaleDateString()}).
        </p>
        <div className="flex gap-2">
          {pending.to_email && (
            <button disabled={busy} onClick={onResend} className="rounded-lg border px-3 py-2 text-sm">Resend invite</button>
          )}
          <button disabled={busy} onClick={onCancel} className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive">Cancel transfer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      <p className="text-sm text-muted-foreground">
        Invite someone to become the owner of this organization. You'll stay on as an admin once they accept.
      </p>
      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="New owner's name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="or Phone (+91…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button disabled={busy} onClick={onInitiate} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Send ownership invite
      </button>
    </div>
  );
}
