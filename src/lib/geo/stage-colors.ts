import { LEAD_STAGES, type LeadStage } from "./stages";

/**
 * Stage → design-token mapping for the funnel chart's bar fills.
 *
 * The badge vocabulary (stageBadgeVariant) deliberately keeps the
 * pre-terminal stages quiet — new is outline-only, contacted/visited are
 * `secondary` (light gray). That works on a chip because the label
 * carries the meaning. It does NOT work on a bar chart, where bars are
 * identified visually and adjacent stages need to read as distinct.
 *
 * So this helper tells a slightly richer visual story while still
 * grounded in the same tokens the rest of the module uses:
 *
 *   new          → muted-foreground @ 0.35  (faint gray; barely started)
 *   contacted    → muted-foreground @ 0.65  (medium gray; some progress)
 *   visited      → primary          @ 0.85  (brand teal; momentum)
 *   negotiation  → warning          @ 1     (amber; attention)
 *   converted    → success          @ 1     (green; closed-won)
 *   lost         → destructive      @ 1     (red; closed-lost)
 *
 * Terminal stages match stageBadgeVariant exactly, so the lost/converted
 * green and amber on the chart are the same hues an operator sees on the
 * stage chips elsewhere in the module — one shade of green, one shade
 * of amber across the whole destination.
 */
const STAGE_CSS_VAR: Record<LeadStage, string> = {
  new: "--muted-foreground",
  contacted: "--muted-foreground",
  visited: "--primary",
  negotiation: "--warning",
  converted: "--success",
  lost: "--destructive",
};

const STAGE_OPACITY: Record<LeadStage, number> = {
  new: 0.35,
  contacted: 0.65,
  visited: 0.85,
  negotiation: 1,
  converted: 1,
  lost: 1,
};

/**
 * Resolve a stage to a concrete hsl() string at runtime by reading the
 * active CSS variable off `<html>`. Use only in client components —
 * returns "transparent" on the server (no window).
 *
 * Reads the active variable each call, so callers can re-invoke on
 * theme change (dark/light toggle, custom theme injection) and the
 * colors track. The funnel chart pairs this with a MutationObserver on
 * documentElement.class so it re-resolves automatically.
 */
export function resolveStageColor(stage: LeadStage): string {
  if (typeof window === "undefined") return "transparent";
  const triple = getComputedStyle(document.documentElement)
    .getPropertyValue(STAGE_CSS_VAR[stage])
    .trim();
  if (!triple) return "transparent";
  const opacity = STAGE_OPACITY[stage];
  return `hsl(${triple} / ${opacity})`;
}

/** Resolve every stage in one pass — handy for the funnel chart's bar
 *  fill map. */
export function resolveAllStageColors(): Record<LeadStage, string> {
  return Object.fromEntries(
    LEAD_STAGES.map((s) => [s, resolveStageColor(s)]),
  ) as Record<LeadStage, string>;
}
