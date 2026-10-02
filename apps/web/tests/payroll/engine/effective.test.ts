import { describe, expect, it } from "vitest";
import {
  computePayslip,
  currentPayMonthIST,
  defaultComponents,
  defaultSettings,
  effectiveComponents,
  legacyComponents,
  LEGACY_GLOBAL_RULES,
  nextMonth,
  pickEffective,
  validateComponents,
  type ComponentDef,
} from "@jambahr/shared/payroll/engine";
import { PAYROLL_NORMS, normFor } from "@jambahr/shared/payroll/norms";

describe("versioned settings and components", () => {
  it("picks the newest version on or before the pay month", () => {
    const rows = [{ effectiveFromMonth: "2026-04", v: 1 }, { effectiveFromMonth: "2026-09", v: 2 }];
    expect(pickEffective(rows, "2026-03")).toBeNull();
    expect(pickEffective(rows, "2026-08")?.v).toBe(1);
    expect(pickEffective(rows, "2026-09")?.v).toBe(2);
  });
  it("resolves each component code independently", () => {
    const base = defaultComponents("gross_first")[0];
    const rows = [
      { ...base, effectiveFromMonth: "2026-04", pct: 50 },
      { ...base, effectiveFromMonth: "2026-10", pct: 45 },
      { ...base, code: "HRA", order: 20, effectiveFromMonth: "2026-04", pct: 40 },
    ];
    const aug = effectiveComponents(rows, "2026-08");
    expect(aug.map((c) => [c.code, c.pct])).toEqual([["BASIC", 50], ["HRA", 40]]);
    expect(effectiveComponents(rows, "2026-10").find((c) => c.code === "BASIC")?.pct).toBe(45);
  });
  it("month helpers", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(currentPayMonthIST(new Date("2026-09-30T19:00:00Z"))).toBe("2026-10"); // 00:30 IST on 1 Oct
  });
});

describe("default components", () => {
  it("switch on exactly the October pay slip's lines", () => {
    for (const mode of ["gross_first", "ctc_first"] as const) {
      const on = defaultComponents(mode).filter((c) => c.enabled).map((c) => c.code).sort();
      expect(on).toEqual(["BASIC", "EPF_EE", "EPF_ER", "PT", "SPECIAL", "TDS"]);
      expect(validateComponents(defaultComponents(mode), mode)).toEqual([]);
    }
  });
  it("compute without errors for a gross-first employee", () => {
    const r = computePayslip({
      settings: defaultSettings("gross_first"),
      components: defaultComponents("gross_first"),
      rules: LEGACY_GLOBAL_RULES,
      employee: { employeeId: "x", monthlyGross: 50000, state: "maharashtra" },
      run: { month: "2026-10" },
    });
    expect(r.grossEarnings).toBe(50000);
    expect(r.lines.find((l) => l.code === "BASIC")?.amount).toBe(25000);
  });
});

describe("validateComponents", () => {
  const legacy = legacyComponents();
  it("accepts the legacy set in CTC mode and rejects it in gross mode", () => {
    expect(validateComponents(legacy, "ctc_first")).toEqual([]);
    expect(validateComponents(legacy, "gross_first").join(" ")).toMatch(/monthly gross/);
  });
  it("catches loops, two balancing lines and unknown bases", () => {
    const comps: ComponentDef[] = [
      ...defaultComponents("gross_first").filter((c) => c.code !== "HRA"),
      { code: "A", label: "A", kind: "earning", method: "pct_of", base: "B", pct: 10, prorate: true, taxable: true, enabled: true, showOnPayslip: true, order: 50 },
      { code: "B", label: "B", kind: "earning", method: "pct_of", base: "A", pct: 10, prorate: true, taxable: true, enabled: true, showOnPayslip: true, order: 51 },
      { code: "C", label: "C", kind: "earning", method: "balancing", prorate: true, taxable: true, enabled: true, showOnPayslip: true, order: 52 },
      { code: "D", label: "D", kind: "earning", method: "pct_of", base: "NOPE", pct: 10, prorate: true, taxable: true, enabled: true, showOnPayslip: true, order: 53 },
    ];
    const msgs = validateComponents(comps, "gross_first").join(" | ");
    expect(msgs).toMatch(/loop/);
    expect(msgs).toMatch(/Only one component can take the balance/);
    expect(msgs).toMatch(/"NOPE" is not a switched-on component/);
  });
  it("a switched-off base is reported", () => {
    const comps = defaultComponents("gross_first").map((c) => (c.code === "HRA" ? { ...c, enabled: true } : c.code === "BASIC" ? { ...c, enabled: false } : c));
    expect(validateComponents(comps, "gross_first").join(" ")).toMatch(/"BASIC" is not a switched-on component/);
  });
});

describe("norm notes", () => {
  it("every note is dated and statutory ones say so", () => {
    for (const [k, n] of Object.entries(PAYROLL_NORMS)) {
      expect(n.asOf, k).toMatch(/^\d{4}-\d{2}$/);
      expect(n.text.length, k).toBeGreaterThan(40);
      if (k.startsWith("rule.")) expect(n.statutory, k).toBe(true);
    }
  });
  it("flags deviations softly without blocking", () => {
    expect(normFor("rule.epf")?.deviates?.({ wageCeiling: 25000 })).toMatch(/Ceiling differs/);
    expect(normFor("rule.epf")?.deviates?.({ wageCeiling: 15000 })).toBeNull();
    expect(normFor("component.basic_pct")?.deviates?.(40)).toMatch(/Below 50%/);
    expect(normFor("nope")).toBeNull();
  });
});
