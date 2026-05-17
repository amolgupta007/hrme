"use client";

import { CheckCircle2, Clock, Send, XCircle, AlertTriangle, FileText } from "lucide-react";

export type OfferChipStatus = "draft" | "sent" | "accepted" | "declined" | "expired" | "revoked";

interface Props {
  status: OfferChipStatus;
  sentAt?: string | null;       // ISO timestamp
  respondedAt?: string | null;  // ISO timestamp
  joiningDate?: string | null;  // YYYY-MM-DD
}

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "soon";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function OfferStatusChip({ status, sentAt, respondedAt, joiningDate }: Props) {
  const meta = (() => {
    switch (status) {
      case "draft":
        return { Icon: FileText, className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "Offer draft" };
      case "sent":
        return { Icon: Send, className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", label: `Offer sent${sentAt ? " " + relTime(sentAt) : ""}` };
      case "accepted":
        return {
          Icon: CheckCircle2,
          className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
          label: joiningDate ? `Accepted ✓ Joining ${joiningDate}` : "Offer accepted ✓",
        };
      case "declined":
        return { Icon: XCircle, className: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300", label: "Offer declined" };
      case "expired":
        return { Icon: Clock, className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", label: "Offer expired" };
      case "revoked":
        return { Icon: AlertTriangle, className: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", label: "Offer revoked" };
    }
  })();
  const Icon = meta.Icon;

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}
      title={respondedAt ? `Responded ${relTime(respondedAt)}` : undefined}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {meta.label}
    </span>
  );
}
