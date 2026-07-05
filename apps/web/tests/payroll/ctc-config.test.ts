import { describe, it, expect } from "vitest";
import { computeCTCBreakdown, DEFAULT_RATIO_CONFIG, type RatioConfig } from "@/lib/ctc";

describe("computeCTCBreakdown — default ratios unchanged", () => {
  it("matches existing 40/50/40/4.81 hard-codes when no config passed", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, true, "new", 0);
    // Basic 40% of 12L = 4.8L. HRA 50% of basic = 2.4L. Gratuity 4.81% of basic = 23,088.
    expect(b.basicAnnual).toBe(480_000);
    expect(b.hraAnnual).toBe(240_000);
    expect(b.employerGratuityAnnual).toBe(23_088);
  });
});

describe("computeCTCBreakdown — config-driven ratios", () => {
  const altConfig: RatioConfig = {
    basic_pct: 50,
    hra_pct_metro: 40,
    hra_pct_non_metro: 30,
    gratuity_pct: 4.81,
  };

  it("uses Basic 50% when config says so", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, true, "new", 0, altConfig);
    expect(b.basicAnnual).toBe(600_000); // 50% of 12L
    // HRA 40% of new basic 6L = 2.4L. Same number coincidentally — test below differentiates.
    expect(b.hraAnnual).toBe(240_000);
    // Gratuity 4.81% of 6L = 28,860.
    expect(b.employerGratuityAnnual).toBe(28_860);
  });

  it("uses HRA non-metro pct when isMetro=false", () => {
    const b = computeCTCBreakdown(1_200_000, "rajasthan", false, true, "new", 0, altConfig);
    expect(b.basicAnnual).toBe(600_000);
    // HRA 30% of 6L = 1.8L.
    expect(b.hraAnnual).toBe(180_000);
  });

  it("omits HRA entirely when includeHra=false", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, false, "new", 0, altConfig);
    expect(b.hraAnnual).toBe(0);
    expect(b.hraMonthly).toBe(0);
  });

  it("special allowance absorbs the leftover after Basic + HRA + employer PF + gratuity", () => {
    const b = computeCTCBreakdown(1_200_000, "maharashtra", true, true, "new", 0, altConfig);
    const expected =
      1_200_000 - b.basicAnnual - b.hraAnnual - b.employerPfAnnual - b.employerGratuityAnnual;
    expect(b.specialAllowanceAnnual).toBe(expected);
  });
});

describe("DEFAULT_RATIO_CONFIG", () => {
  it("matches the historical hard-codes", () => {
    expect(DEFAULT_RATIO_CONFIG).toEqual({
      basic_pct: 40,
      hra_pct_metro: 50,
      hra_pct_non_metro: 40,
      gratuity_pct: 4.81,
    });
  });
});
