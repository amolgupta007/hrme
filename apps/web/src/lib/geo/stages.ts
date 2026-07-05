export const LEAD_STAGES = [
  "new",
  "contacted",
  "visited",
  "negotiation",
  "converted",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_OUTCOMES = [
  "in_progress",
  "converted",
  "pending",
  "follow_up",
  "lost",
] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

/**
 * Common Indian SMB lead sources, in roughly observed frequency. Used to seed
 * the LeadDialog source picker; backwards-compatible with legacy free-text
 * values already in the database (admin can still pick "Other" or any of
 * these). Phase 2 may switch this to a per-org-configurable list.
 */
export const LEAD_SOURCES = [
  "Walk-in",
  "Referral",
  "WhatsApp",
  "IndiaMART",
  "JustDial",
  "Google",
  "Facebook",
  "Direct",
  "Other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * For a system-authored visit row capturing a kanban stage change,
 * derive a default outcome from the destination stage.
 */
export function mapStageToOutcome(stage: LeadStage): LeadOutcome {
  if (stage === "converted") return "converted";
  if (stage === "lost") return "lost";
  return "in_progress";
}

/**
 * When a human logs a visit, certain terminal outcomes force a stage flip.
 * Returns null when the lead's stage should remain unchanged.
 */
export function mapOutcomeToStage(outcome: LeadOutcome): LeadStage | null {
  if (outcome === "converted") return "converted";
  if (outcome === "lost") return "lost";
  return null;
}

const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  visited: "Visited",
  negotiation: "Negotiation",
  converted: "Converted",
  lost: "Lost",
};

const OUTCOME_LABELS: Record<LeadOutcome, string> = {
  in_progress: "In progress",
  converted: "Converted",
  pending: "Pending",
  follow_up: "Follow-up",
  lost: "Lost",
};

export function stageLabel(stage: LeadStage): string {
  return STAGE_LABELS[stage];
}

export function outcomeLabel(outcome: LeadOutcome): string {
  return OUTCOME_LABELS[outcome];
}

/**
 * Badge variant for a lead stage. Distinguishes terminal outcomes (converted
 * = success, lost = destructive) and the late-funnel negotiation step
 * (warning) from the earlier pipeline. Used by every chip rendering of a
 * stage so scanning a table for closed-won vs closed-lost is possible
 * without reading every label. Reinforce with `aria-label={stageLabel(s)}`
 * on the badge so the color carries no semantic weight on its own.
 */
type StageBadgeVariant = "default" | "secondary" | "destructive" | "success" | "warning" | "outline";

const STAGE_BADGE_VARIANTS: Record<LeadStage, StageBadgeVariant> = {
  new: "outline",
  contacted: "secondary",
  visited: "secondary",
  negotiation: "warning",
  converted: "success",
  lost: "destructive",
};

export function stageBadgeVariant(stage: LeadStage): StageBadgeVariant {
  return STAGE_BADGE_VARIANTS[stage];
}

/**
 * Same pattern for visit outcomes. Keeps VisitTimeline and stage chips
 * speaking the same color vocabulary (converted always success, lost
 * always destructive) so the page reads as one system.
 */
const OUTCOME_BADGE_VARIANTS: Record<LeadOutcome, StageBadgeVariant> = {
  in_progress: "secondary",
  pending: "outline",
  follow_up: "outline",
  converted: "success",
  lost: "destructive",
};

export function outcomeBadgeVariant(outcome: LeadOutcome): StageBadgeVariant {
  return OUTCOME_BADGE_VARIANTS[outcome];
}
