/**
 * Single source of truth for the referrer-facing status mapper.
 * The DB stores fine-grained ReferralStatus; the referrer only ever sees
 * the CoarseStatus computed here. NEVER expose ReferralStatus directly
 * in any /dashboard/refer/* response.
 */

export type ReferralStatus =
  | "pending_apply"
  | "applied"
  | "in_review"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export type CoarseStatus =
  | "submitted"
  | "being_reviewed"
  | "progressing"
  | "closed_hired"
  | "closed_no_match";

export function toCoarse(status: ReferralStatus): CoarseStatus {
  switch (status) {
    case "pending_apply":
      return "submitted";
    case "applied":
    case "in_review":
      return "being_reviewed";
    case "interview":
    case "offer":
      return "progressing";
    case "hired":
      return "closed_hired";
    case "rejected":
    case "withdrawn":
      return "closed_no_match";
  }
}

export const COARSE_LABEL: Record<CoarseStatus, string> = {
  submitted: "Submitted",
  being_reviewed: "Being reviewed",
  progressing: "Progressing",
  closed_hired: "Hired",
  closed_no_match: "Closed — no match",
};

/**
 * Map an applications.stage value (the JambaHire pipeline stage) onto a
 * ReferralStatus, used when the application moves and we need to update
 * the linked referral.
 */
export function applicationStageToReferralStatus(stage: string): ReferralStatus {
  switch (stage) {
    case "applied":
      return "applied";
    case "screening":
      return "in_review";
    case "interview_1":
    case "interview_2":
    case "final_round":
      return "interview";
    case "offer":
      return "offer";
    case "hired":
      return "hired";
    default:
      return "in_review";
  }
}
