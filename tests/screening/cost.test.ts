import { describe, it, expect } from "vitest";
import { screeningCostPaise } from "@/lib/screening/cost";

describe("screeningCostPaise", () => {
  it("prices sonnet input+output in paise", () => {
    // 1M in @ $3 + 1M out @ $15 = $18 * 86 * 100 = 154800 paise
    expect(
      screeningCostPaise({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBe(154800);
  });
  it("prices haiku cheaper than sonnet for the same tokens", () => {
    const h = screeningCostPaise({ model: "claude-haiku-4-5-20251001", inputTokens: 1_000_000, outputTokens: 0 });
    const s = screeningCostPaise({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 0 });
    expect(h).toBeLessThan(s);
  });
});
