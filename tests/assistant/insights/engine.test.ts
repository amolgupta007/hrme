import { describe, it, expect } from "vitest";
import { isRuleApplicable, selectTopInsights } from "@/lib/assistant/insights/engine";
import type { InsightRule, InsightContext, Insight } from "@/lib/assistant/insights/types";

const ctx = (over: Partial<InsightContext> = {}): InsightContext => ({
  orgId: "o1",
  plan: "growth",
  today: new Date("2026-05-22T00:00:00.000Z"),
  flags: { jambaHireEnabled: false, attendanceEnabled: false, grievancesEnabled: false },
  ...over,
});

const rule = (over: Partial<InsightRule> = {}): InsightRule => ({
  key: "r", category: "leave", basePriority: 10, deepLink: "/dashboard/leaves",
  fetch: async () => ({}), evaluate: () => null, ...over,
});

describe("isRuleApplicable", () => {
  it("allows a rule with no gates", () => {
    expect(isRuleApplicable(rule(), ctx())).toBe(true);
  });
  it("blocks a feature-gated rule on starter", () => {
    expect(isRuleApplicable(rule({ requiredFeature: "training" }), ctx({ plan: "starter" }))).toBe(false);
  });
  it("allows a feature-gated rule on growth", () => {
    expect(isRuleApplicable(rule({ requiredFeature: "training" }), ctx({ plan: "growth" }))).toBe(true);
  });
  it("blocks a flag-gated rule when the flag is off", () => {
    expect(isRuleApplicable(rule({ requiredFlag: "grievancesEnabled" }), ctx())).toBe(false);
  });
  it("allows a flag-gated rule when the flag is on", () => {
    const c = ctx({ flags: { jambaHireEnabled: false, attendanceEnabled: false, grievancesEnabled: true } });
    expect(isRuleApplicable(rule({ requiredFlag: "grievancesEnabled" }), c)).toBe(true);
  });
});

describe("selectTopInsights", () => {
  const ins = (priority: number): Insight => ({
    ruleKey: "k", category: "leave", priority, title: "t", body: "b", metricCount: 1, deepLink: "/dashboard/leaves",
  });
  it("returns the 3 highest-priority insights, descending", () => {
    const out = selectTopInsights([ins(10), ins(50), ins(30), ins(90), ins(20)]);
    expect(out.map((i) => i.priority)).toEqual([90, 50, 30]);
  });
  it("returns all when fewer than 3", () => {
    expect(selectTopInsights([ins(5)]).length).toBe(1);
  });
});
