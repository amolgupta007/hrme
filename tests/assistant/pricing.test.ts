import { describe, it, expect } from "vitest";
import { tokensToInrPaise, PLAN_BUDGET_PAISE, STARTER_CREDIT_PAISE } from "@/lib/assistant/pricing";

// Hand-computed expected values:
//
// Rates: input=$3/M, output=$15/M, USD_TO_INR=86, INR_PER_PAISA=100
//
// 1,000,000 input + 1,000,000 output:
//   usd = (1*3 + 1*15) = 18
//   paise = round(18 * 86 * 100) = round(154800) = 154800
//
// 100,000 input + 50,000 output:
//   usd = (0.1*3 + 0.05*15) = 0.3 + 0.75 = 1.05
//   paise = round(1.05 * 86 * 100) = round(9030) = 9030

describe("tokensToInrPaise", () => {
  it("converts 1M input + 1M output to 154800 paise", () => {
    expect(
      tokensToInrPaise({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
    ).toBe(154_800);
  });

  it("falls back to default rate when model is unknown", () => {
    // Unknown model → same result as the default model
    expect(
      tokensToInrPaise({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        model: "some/unknown-model-xyz",
      })
    ).toBe(154_800);
  });

  it("returns 0 for zero tokens", () => {
    expect(tokensToInrPaise({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("converts 100k input + 50k output to 9030 paise", () => {
    // usd = (0.1*3 + 0.05*15) = 1.05; paise = round(1.05 * 86 * 100) = 9030
    expect(
      tokensToInrPaise({ inputTokens: 100_000, outputTokens: 50_000 })
    ).toBe(9_030);
  });
});

describe("PLAN_BUDGET_PAISE", () => {
  it("starter budget is 0", () => {
    expect(PLAN_BUDGET_PAISE.starter).toBe(0);
  });

  it("growth budget is 50000 paise (₹500)", () => {
    expect(PLAN_BUDGET_PAISE.growth).toBe(50_000);
  });

  it("business budget is 200000 paise (₹2000)", () => {
    expect(PLAN_BUDGET_PAISE.business).toBe(200_000);
  });

  it("custom budget equals business budget", () => {
    expect(PLAN_BUDGET_PAISE.custom).toBe(PLAN_BUDGET_PAISE.business);
  });
});

describe("STARTER_CREDIT_PAISE", () => {
  it("is 20000 paise (₹200)", () => {
    expect(STARTER_CREDIT_PAISE).toBe(20_000);
  });
});
