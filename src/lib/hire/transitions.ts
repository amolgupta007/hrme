// M3 — transition action planning (pure, client-callable).
//
// `planActionsForTransition` returns the side-effect actions the Confirm-Send
// popup should display when a card is moved into `toStage`. Server-side
// dispatcher lives in src/actions/hire.ts and uses the same action keys.

import type { ApplicationStage } from "@/actions/hire";
import type { TransitionDirection } from "./stage-direction";

export type ActionKey =
  | "email-candidate-ack"
  | "email-interview-next-round"
  | "email-rejection";

export type TransitionAction = {
  key: ActionKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export function planActionsForTransition(
  direction: TransitionDirection,
  fromStage: ApplicationStage | null,
  toStage: ApplicationStage,
): TransitionAction[] {
  if (direction === "reject") {
    const interviewLike = fromStage
      ? (["interview_1", "interview_2", "final_round", "offer"] as ApplicationStage[]).includes(fromStage)
      : false;
    return [
      {
        key: "email-rejection",
        label: "Email candidate (rejection)",
        description: interviewLike
          ? "Sends the warmer post-interview rejection note."
          : "Sends the neutral early-stage rejection note.",
        defaultEnabled: true,
      },
    ];
  }

  if (direction === "forward" || direction === "initial") {
    if (toStage === "screening" && fromStage === "applied") {
      return [
        {
          key: "email-candidate-ack",
          label: "Email candidate (acknowledgement)",
          description: "Lets the candidate know their application is being reviewed.",
          defaultEnabled: true,
        },
      ];
    }
    if (toStage === "interview_2" && fromStage === "interview_1") {
      return [
        {
          key: "email-interview-next-round",
          label: "Email candidate (advancing to Round 2)",
          description: "Confirms they're moving forward to the next interview round.",
          defaultEnabled: true,
        },
      ];
    }
    if (toStage === "final_round" && fromStage === "interview_2") {
      return [
        {
          key: "email-interview-next-round",
          label: "Email candidate (advancing to Final Round)",
          description: "Confirms they're moving forward to the final round.",
          defaultEnabled: true,
        },
      ];
    }
  }

  return [];
}

export function roundLabelForStage(toStage: ApplicationStage): string {
  switch (toStage) {
    case "interview_2": return "Round 2";
    case "final_round": return "Final round";
    default: return "the next round";
  }
}
