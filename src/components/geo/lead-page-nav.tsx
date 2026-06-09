import Link from "next/link";
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
 * Sub-header that appears above the lead info card. Sits inline rather than
 * in the destination chrome because it's per-page and depends on per-page
 * server data (sibling IDs in the caller's scope).
 *
 * Sticky on md+: pins directly under the GeoHeader (h-14) so "Back to Leads"
 * and Prev/Next stay reachable while the visit timeline scrolls. Mobile
 * stays inline — chrome already has two stacked rows there, three would
 * own too much real estate. The negative margin breaks out of the parent
 * <main>'s px-6 py-8 padding so the sticky bar can extend edge-to-edge with
 * its own background.
 */
export function LeadPageNav({ prev, next, position }: LeadPageNavProps) {
  return (
    <div className="mb-4 -mx-6 md:sticky md:top-14 md:z-30 border-b border-border bg-background px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/geo/leads"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          focusRing,
        )}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Leads
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
              href={`/geo/leads/${prev.id}`}
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
              href={`/geo/leads/${next.id}`}
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
