import { describe, it, expect } from "vitest";
import { canUseAssistant, getMonthlyQuota } from "@/lib/assistant/permissions";

describe("getMonthlyQuota", () => {
  it("returns 0 for starter", () => expect(getMonthlyQuota("starter")).toBe(0));
  it("returns 30 for growth", () => expect(getMonthlyQuota("growth")).toBe(30));
  it("returns 'unlimited' for business", () => expect(getMonthlyQuota("business")).toBe("unlimited"));
  it("returns 'unlimited' for custom", () => expect(getMonthlyQuota("custom")).toBe("unlimited"));
});

describe("canUseAssistant", () => {
  const base = { role: "admin" as const, orgEnabled: true, monthUsage: 0 };

  it("locks starter", () => {
    const r = canUseAssistant({ ...base, plan: "starter" });
    expect(r).toEqual({ allowed: false, reason: "plan-locked" });
  });

  it("allows growth with 30-question quota", () => {
    const r = canUseAssistant({ ...base, plan: "growth" });
    expect(r).toEqual({ allowed: true, quota: 30, remaining: 30 });
  });

  it("decrements growth remaining as usage grows", () => {
    const r = canUseAssistant({ ...base, plan: "growth", monthUsage: 25 });
    expect(r).toEqual({ allowed: true, quota: 30, remaining: 5 });
  });

  it("clamps growth remaining at zero", () => {
    const r = canUseAssistant({ ...base, plan: "growth", monthUsage: 40 });
    expect(r).toEqual({ allowed: true, quota: 30, remaining: 0 });
  });

  it("business is unlimited", () => {
    const r = canUseAssistant({ ...base, plan: "business" });
    expect(r).toEqual({ allowed: true, quota: "unlimited", remaining: "unlimited" });
  });

  it("custom inherits unlimited", () => {
    const r = canUseAssistant({ ...base, plan: "custom" });
    expect(r).toEqual({ allowed: true, quota: "unlimited", remaining: "unlimited" });
  });

  it("denies when org has disabled assistant", () => {
    const r = canUseAssistant({ ...base, orgEnabled: false, plan: "business" });
    expect(r).toEqual({ allowed: false, reason: "org-disabled" });
  });

  it("denies when no employee record (role null)", () => {
    const r = canUseAssistant({ ...base, role: null, plan: "business" });
    expect(r).toEqual({ allowed: false, reason: "no-employee-record" });
  });
});
