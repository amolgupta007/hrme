import type { Tier, CoverageItem } from "./types";

export function scoreToTier(score: number): Tier {
  if (score >= 75) return "strong";
  if (score >= 50) return "possible";
  return "weak";
}

export function summarizeCoverage(coverage: CoverageItem[]): { green: number; amber: number; red: number } {
  return coverage.reduce(
    (acc, c) => {
      acc[c.status] += 1;
      return acc;
    },
    { green: 0, amber: 0, red: 0 },
  );
}
