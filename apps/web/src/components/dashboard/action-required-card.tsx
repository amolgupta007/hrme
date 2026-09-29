import Link from "next/link";
import { AlertTriangle, ChevronRight, ShieldCheck } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { announcementAnchor } from "@/lib/announcements/categories";
import type { PendingAck } from "@/lib/announcements/pending";

/** Dashboard card listing announcements waiting for the viewer's acknowledgement. */
export function ActionRequiredCard({ items }: { items: PendingAck[] }) {
  if (items.length === 0) return null;
  const overdue = items.filter((i) => i.overdue).length;

  return (
    <section
      aria-labelledby="action-required-heading"
      className={cn(
        "rounded-xl border bg-card",
        overdue > 0 ? "border-destructive/40" : "border-primary/30"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="action-required-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Action required
          <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
            {items.length}
          </span>
        </h2>
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> {overdue} overdue
          </span>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>
            <Link
              href={`/dashboard/announcements#${announcementAnchor(item.id)}`}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">Acknowledge: {item.title}</span>
                <span className={cn("text-xs", item.overdue ? "text-destructive" : "text-muted-foreground")}>
                  {item.ack_due_date
                    ? item.overdue
                      ? `Overdue — was due ${formatDate(item.ack_due_date)}`
                      : `Due ${formatDate(item.ack_due_date)}`
                    : "No due date"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <Link
          href="/dashboard/announcements"
          className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/50"
        >
          View all {items.length}
        </Link>
      )}
    </section>
  );
}
