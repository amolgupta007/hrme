import { describe, expect, it } from "vitest";
import {
  LEAD_STAGES,
  LEAD_OUTCOMES,
  mapStageToOutcome,
  mapOutcomeToStage,
  stageLabel,
  outcomeLabel,
} from "@/lib/geo/stages";

describe("LEAD_STAGES", () => {
  it("contains exactly the 6 fixed stages", () => {
    expect(LEAD_STAGES).toEqual([
      "new", "contacted", "visited", "negotiation", "converted", "lost",
    ]);
  });
});

describe("mapStageToOutcome", () => {
  it("maps converted → converted", () => {
    expect(mapStageToOutcome("converted")).toBe("converted");
  });
  it("maps lost → lost", () => {
    expect(mapStageToOutcome("lost")).toBe("lost");
  });
  it("maps in-flight stages → in_progress", () => {
    expect(mapStageToOutcome("new")).toBe("in_progress");
    expect(mapStageToOutcome("contacted")).toBe("in_progress");
    expect(mapStageToOutcome("visited")).toBe("in_progress");
    expect(mapStageToOutcome("negotiation")).toBe("in_progress");
  });
});

describe("mapOutcomeToStage", () => {
  it("converted → 'converted'", () => {
    expect(mapOutcomeToStage("converted")).toBe("converted");
  });
  it("lost → 'lost'", () => {
    expect(mapOutcomeToStage("lost")).toBe("lost");
  });
  it("in_progress / pending / follow_up → null (no auto-stage change)", () => {
    expect(mapOutcomeToStage("in_progress")).toBeNull();
    expect(mapOutcomeToStage("pending")).toBeNull();
    expect(mapOutcomeToStage("follow_up")).toBeNull();
  });
});

describe("labels", () => {
  it("stageLabel returns Title Case", () => {
    expect(stageLabel("negotiation")).toBe("Negotiation");
    expect(stageLabel("new")).toBe("New");
  });
  it("outcomeLabel returns human-friendly", () => {
    expect(outcomeLabel("follow_up")).toBe("Follow-up");
    expect(outcomeLabel("in_progress")).toBe("In progress");
  });
});
