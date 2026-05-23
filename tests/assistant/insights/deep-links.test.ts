// tests/assistant/insights/deep-links.test.ts
import { describe, it, expect } from "vitest";
import { INSIGHT_RULES } from "@/lib/assistant/insights/registry";

describe("insight rule registry", () => {
  it("has 11 rules with unique keys", () => {
    expect(INSIGHT_RULES.length).toBe(11);
    expect(new Set(INSIGHT_RULES.map((r) => r.key)).size).toBe(11);
  });
  it("every deepLink points to a known dashboard or hire route", () => {
    for (const r of INSIGHT_RULES) {
      expect(r.deepLink.startsWith("/dashboard/") || r.deepLink.startsWith("/hire/")).toBe(true);
    }
  });
  it("every rule has a positive basePriority and valid category", () => {
    const cats = new Set(["leave", "compliance", "people", "ops"]);
    for (const r of INSIGHT_RULES) {
      expect(r.basePriority).toBeGreaterThan(0);
      expect(cats.has(r.category)).toBe(true);
    }
  });
});
