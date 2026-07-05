import { describe, it, expect } from "vitest";
import { scoreToTier, summarizeCoverage } from "@/lib/screening/tier";

describe("scoreToTier", () => {
  it("maps bands", () => {
    expect(scoreToTier(90)).toBe("strong");
    expect(scoreToTier(75)).toBe("strong");
    expect(scoreToTier(60)).toBe("possible");
    expect(scoreToTier(50)).toBe("possible");
    expect(scoreToTier(40)).toBe("weak");
  });
});

describe("summarizeCoverage", () => {
  it("counts by status", () => {
    expect(
      summarizeCoverage([
        { label: "a", status: "green", note: null },
        { label: "b", status: "red", note: null },
        { label: "c", status: "green", note: null },
      ]),
    ).toEqual({ green: 2, amber: 0, red: 1 });
  });
});
