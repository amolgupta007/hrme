"use client";

import * as React from "react";
import { CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import { formatINR } from "@/lib/ctc";

interface ItemProps {
  item: {
    id: string;
    employee_id: string;
    fund_account_id: string;
    amount: number;
    fee_paise: number;
    status: "pending" | "queued" | "processing" | "paid" | "failed" | "cancelled" | "reversed";
    razorpayx_payout_id: string | null;
    failure_reason: string | null;
    retry_count: number;
    employees?: { first_name: string; last_name: string } | null;
  };
}

function StatusBadge({ status }: { status: ItemProps["item"]["status"] }) {
  const map = {
    pending: { Icon: Clock, label: "Pending", cls: "bg-muted text-muted-foreground" },
    queued: { Icon: Clock, label: "Queued", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
    processing: { Icon: Loader2, label: "Processing", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
    paid: { Icon: CheckCircle, label: "Paid", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
    failed: { Icon: AlertCircle, label: "Failed", cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400" },
    cancelled: { Icon: AlertCircle, label: "Cancelled", cls: "bg-muted text-muted-foreground" },
    reversed: { Icon: AlertCircle, label: "Reversed", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  };
  const { Icon, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />{label}
    </span>
  );
}

export function DisbursementItemRow({ item }: ItemProps) {
  const name = item.employees ? `${item.employees.first_name} ${item.employees.last_name}` : "Unknown";
  return (
    <tr className="border-t border-border text-xs">
      <td className="px-3 py-2">{name}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatINR(item.amount)}</td>
      <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {item.fee_paise > 0 ? formatINR(item.fee_paise / 100) : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
        {item.razorpayx_payout_id ? item.razorpayx_payout_id.slice(-12) : "—"}
        {item.retry_count > 0 && <span className="ml-1 text-amber-600">(retry {item.retry_count})</span>}
      </td>
      <td className="px-3 py-2 text-xs text-red-600">
        {item.failure_reason ?? ""}
      </td>
    </tr>
  );
}
