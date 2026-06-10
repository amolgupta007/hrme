"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  outcomeBadgeVariant,
  outcomeLabel,
  type LeadOutcome,
} from "@/lib/geo/stages";
import { AlertCircle, Calendar, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";

interface VisitRow {
  id: string;
  notes: string | null;
  outcome: LeadOutcome;
  follow_up_date: string | null;
  employee_name: string | null;
  source: "web" | "mobile";
  system: boolean;
  visited_at: string;
}

interface VisitTimelineProps {
  visits: VisitRow[];
  /** True when the page-level visit fetch failed. The timeline still
   *  renders whatever rows it received (often []), but shows a small
   *  banner so the absence isn't mistaken for "no visits". */
  error?: boolean;
}

type BucketKey = "today" | "yesterday" | "thisWeek" | "earlier";

const BUCKET_ORDER: BucketKey[] = ["today", "yesterday", "thisWeek", "earlier"];

const BUCKET_LABELS: Record<BucketKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  earlier: "Earlier",
};

function bucketFor(visitedAt: string): BucketKey {
  const target = new Date(visitedAt);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return "thisWeek";
  return "earlier";
}

const EARLIER_AUTOCOLLAPSE_THRESHOLD = 5;

export function VisitTimeline({ visits, error }: VisitTimelineProps) {
  // Bucketise once per render. Visits arrive newest-first; keep that order
  // within each bucket too.
  const buckets: Record<BucketKey, VisitRow[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };
  for (const v of visits) {
    buckets[bucketFor(v.visited_at)].push(v);
  }

  // Collapse the Earlier bucket by default when it dwarfs the rest, so the
  // operator's eye lands on what's recent.
  const [earlierOpen, setEarlierOpen] = useState(
    buckets.earlier.length <= EARLIER_AUTOCOLLAPSE_THRESHOLD,
  );

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            Couldn&apos;t load visit history. Refresh to retry — the list
            below may be incomplete.
          </span>
        </div>
      )}

      {visits.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No visits logged yet. Use &quot;Log visit&quot; to record what
          happened on each touchpoint with this lead.
        </p>
      ) : (
        BUCKET_ORDER.map((key) => {
          const rows = buckets[key];
          if (rows.length === 0) return null;
          const isEarlier = key === "earlier";

          return (
            <section key={key} aria-label={`${BUCKET_LABELS[key]} visits`}>
              <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>{BUCKET_LABELS[key]}</span>
                {isEarlier && rows.length > EARLIER_AUTOCOLLAPSE_THRESHOLD ? (
                  <button
                    type="button"
                    onClick={() => setEarlierOpen((v) => !v)}
                    aria-expanded={earlierOpen}
                    className="inline-flex items-center gap-1 rounded normal-case tracking-normal text-xs font-normal hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    {earlierOpen ? (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3 w-3" aria-hidden />
                    )}
                    {earlierOpen
                      ? `Hide ${rows.length} earlier visits`
                      : `Show ${rows.length} earlier visits`}
                  </button>
                ) : (
                  <span className="tabular-nums normal-case tracking-normal text-xs font-normal text-muted-foreground">
                    {rows.length}
                  </span>
                )}
              </div>

              {(!isEarlier || earlierOpen) && (
                <ol className="space-y-3">
                  {rows.map((v) => (
                    <VisitItem key={v.id} v={v} />
                  ))}
                </ol>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function VisitItem({ v }: { v: VisitRow }) {
  return (
    <li
      className={
        "rounded border p-3 " +
        (v.system ? "bg-muted/30 border-dashed text-xs" : "bg-card")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {v.system ? (
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          ) : (
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          )}
          <span className="font-medium text-sm">
            {v.employee_name ?? "Unknown"}
          </span>
          <Badge
            variant={outcomeBadgeVariant(v.outcome)}
            aria-label={`Outcome: ${outcomeLabel(v.outcome)}`}
            className="text-[10px]"
          >
            {outcomeLabel(v.outcome)}
          </Badge>
          {v.system && (
            <span className="text-[10px] italic text-muted-foreground">
              system
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {formatDateTime(v.visited_at)}
        </span>
      </div>
      {v.notes && (
        <p className="text-sm mt-2 whitespace-pre-wrap">{v.notes}</p>
      )}
      {v.follow_up_date && (
        <p className="text-xs text-muted-foreground mt-1">
          Follow-up: {formatDate(v.follow_up_date)}
        </p>
      )}
    </li>
  );
}
