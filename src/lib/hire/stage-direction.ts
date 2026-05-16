import type { ApplicationStage } from "@/actions/hire";

// Canonical ordering for forward/backward inference.
// `rejected` is terminal and not in the linear flow — handled explicitly.
const STAGE_ORDER: Record<Exclude<ApplicationStage, "rejected">, number> = {
  applied: 0,
  screening: 1,
  shortlisted: 2,
  interview_1: 3,
  interview_2: 4,
  final_round: 5,
  offer: 6,
  hired: 7,
};

export type TransitionDirection = "forward" | "backward" | "reject" | "undo" | "initial";

export function computeDirection(
  from: ApplicationStage | null,
  to: ApplicationStage,
): TransitionDirection {
  if (from === null) return "initial";
  if (from === to) return "forward";
  if (to === "rejected") return "reject";
  // Un-reject (rejected → anything else) treated as a forward recovery.
  if (from === "rejected") return "forward";
  const fromOrder = STAGE_ORDER[from];
  const toOrder = STAGE_ORDER[to];
  return toOrder >= fromOrder ? "forward" : "backward";
}

export function isBackwardMove(from: ApplicationStage, to: ApplicationStage): boolean {
  return computeDirection(from, to) === "backward";
}
