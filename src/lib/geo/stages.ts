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
