"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { withdrawReferral } from "@/actions/referrals";
import type { CoarseStatus } from "@/lib/referrals/status";

interface Props {
  referralId: string;
  candidateName: string;
  coarseStatus: CoarseStatus;
}

const WITHDRAWABLE: ReadonlyArray<CoarseStatus> = ["submitted", "being_reviewed"];

export function MyReferralRowActions({ referralId, candidateName, coarseStatus }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!WITHDRAWABLE.includes(coarseStatus)) return null;

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await withdrawReferral(referralId);
      if (res.success) {
        toast.success("Referral withdrawn");
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-rose-700 hover:underline"
      >
        Withdraw
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setConfirming(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-foreground">Withdraw referral?</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              You&apos;re about to withdraw the referral for <strong>{candidateName}</strong>. This stops
              the application from moving forward. You can&apos;t undo this from your side — only an admin can.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending}
                className="rounded-md bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? "Withdrawing…" : "Yes, withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
