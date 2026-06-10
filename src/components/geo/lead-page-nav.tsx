"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiblingLead {
  id: string;
  name: string;
}

interface LeadPageNavProps {
  prev: SiblingLead | null;
  next: SiblingLead | null;
  position?: { index: number; total: number };
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

const chipBase =
  "inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors";

/**
 * Single source of truth for referrer keys. The `from` query param on a
 * lead detail URL says where the operator came from — used to swap the
 * "Back to Leads" target so reports→lead→back returns to /geo/reports,
 * not to the kanban. Add a new entry when a new surface links to lead
 * detail with its own back-target.
 */
const REFERRER_MAP: Record<string, { label: string; href: string }> = {
  reports: { label: "Back to Reports", href: "/geo/reports" },
  "my-leads": { label: "Back to My Leads", href: "/geo/my-leads" },
};

const DEFAULT_BACK = { label: "Back to Leads", href: "/geo/leads" };

/**
 * Sub-header that appears above the lead info card. Sits inline rather than
 * in the destination chrome because it's per-page and depends on per-page
 * server data (sibling IDs in the caller's scope).
 *
 * Sticky on md+: pins directly under the GeoHeader (h-14) so "Back" and
 * Prev/Next stay reachable while the visit timeline scrolls. Mobile stays
 * inline — chrome already has two stacked rows there, three would own
 * too much real estate.
 *
 * Reads ?from= to figure out where "back" should go. Defaults to Leads.
 * Prev/Next links propagate ?from= so walking siblings doesn't silently
 * change the back-target.
 */
export function LeadPageNav({ prev, next, position }: LeadPageNavProps) {
  const searchParams = useSearchParams();
  const fromKey = searchParams?.get("from") ?? "";
  const back = REFERRER_MAP[fromKey] ?? DEFAULT_BACK;
  const fromSuffix = fromKey && REFERRER_MAP[fromKey] ? `?from=${fromKey}` : "";

  return (
    <div className="mb-4 -mx-6 md:sticky md:top-14 md:z-30 border-b border-border bg-background px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      <Link
        href={back.href}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          focusRing,
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {back.label}
      </Link>

      <div className="flex items-center gap-2">
        {position ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {position.index} of {position.total}
          </span>
        ) : null}

        <div className="flex items-center gap-1.5">
          {prev ? (
            <Link
              href={`/geo/leads/${prev.id}${fromSuffix}`}
              aria-label={`Previous lead: ${prev.name}`}
              className={cn(
                chipBase,
                "hover:bg-muted hover:text-foreground",
                focusRing,
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Prev</span>
            </Link>
          ) : (
            <span
              role="link"
              aria-disabled="true"
              aria-label="Previous lead — this is the first lead"
              className={cn(chipBase, "cursor-not-allowed opacity-40")}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Prev</span>
            </span>
          )}

          {next ? (
            <Link
              href={`/geo/leads/${next.id}${fromSuffix}`}
              aria-label={`Next lead: ${next.name}`}
              className={cn(
                chipBase,
                "hover:bg-muted hover:text-foreground",
                focusRing,
              )}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span
              role="link"
              aria-disabled="true"
              aria-label="Next lead — this is the last lead"
              className={cn(chipBase, "cursor-not-allowed opacity-40")}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
