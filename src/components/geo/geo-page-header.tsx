import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GeoPageHeaderProps {
  /** Page-level h1. Wrapped in text-balance so long titles (e.g. a lead's
   *  name) don't orphan a single word on the last line. */
  title: ReactNode;
  /** Optional one-sentence sub-copy explaining what the page is for or
   *  what data lives here. Capped at prose width so long ledes don't
   *  stretch edge-to-edge on wide monitors. */
  lede?: ReactNode;
  /** Optional content rendered to the right of the title — typically a
   *  page-level CTA (e.g. "Log visit" on the lead detail page). Hidden
   *  on mobile by default; callers can pass md:flex utilities if a
   *  desktop-only presentation is wanted. */
  rightSlot?: ReactNode;
  className?: string;
}

/**
 * Shared page-level header for every `/geo/*` destination. Single source
 * of truth for the typographic scale (text-2xl semibold tracking-tight),
 * the title-to-lede spacing rhythm (mt-1), and the bottom margin to the
 * content beneath (mb-6).
 *
 * Existed inline on `/geo/leads` and `/geo/leads/[id]` from earlier
 * critique passes; promoted to a component so the four Tier-2 pages
 * (`my-leads`, `geofences`, `live-map`, `reports`) can adopt the same
 * pattern instead of each drifting toward its own CardTitle / muted-
 * paragraph improvisation.
 */
export function GeoPageHeader({
  title,
  lede,
  rightSlot,
  className,
}: GeoPageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      {lede ? (
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {lede}
        </p>
      ) : null}
    </header>
  );
}
