"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acknowledgeIssuedDocument, declineIssuedDocument } from "@/actions/documents-templating";

export function AckForm({ token, statement }: { token: string; statement: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  async function onAccept() {
    if (name.trim().length < 2) {
      toast.error("Please type your full name to acknowledge");
      return;
    }
    setPending(true);
    const res = await acknowledgeIssuedDocument(token, name.trim());
    setPending(false);
    if (res.success) {
      toast.success("Acknowledged");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function onDecline() {
    setPending(true);
    const res = await declineIssuedDocument(token, reason.trim() || undefined);
    setPending(false);
    if (res.success) {
      toast.success("Response recorded");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{statement}</p>
      </div>

      <div>
        <label htmlFor="signer" className="text-sm font-medium text-foreground">
          Type your full name to acknowledge
        </label>
        <input
          id="signer"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full legal name"
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <button
        type="button"
        onClick={onAccept}
        disabled={pending}
        className="w-full rounded-xl bg-primary px-4 py-3 text-primary-foreground font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
      >
        {pending ? "Submitting…" : "I acknowledge & accept"}
      </button>

      {!declining ? (
        <button
          type="button"
          onClick={() => setDeclining(true)}
          disabled={pending}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-muted-foreground font-medium text-sm hover:bg-muted transition"
        >
          Decline
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={pending}
              className="flex-1 rounded-lg bg-destructive px-3 py-2 text-destructive-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              Confirm decline
            </button>
            <button
              type="button"
              onClick={() => setDeclining(false)}
              disabled={pending}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
