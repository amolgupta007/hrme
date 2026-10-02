import { describe, expect, it } from "vitest";
import {
  computePayslip,
  employedCalendarDays,
  projectAnnualCtc,
  resolveRule,
  RULE_PARAM_SCHEMAS,
  type StatutoryRule,
} from "@jambahr/shared/payroll/engine";
import { NEW_EPF_SHEET } from "./medialoop-sheets.fixture";
import {
  MEDIALOOP_RULES,
  MEDIALOOP_SETTINGS,
  MEDIALOOP_SETTINGS_UNROUNDED,
  NEW_SHEET_COMPONENTS,
  employeeFromRow,
} from "./medialoop-config";

const row = (code: string) => NEW_EPF_SHEET.rows.find((r) => r.code === code)!;
const run = (code: string, month: string, extra: Partial<Parameters<typeof computePayslip>[0]> = {}) =>
  computePayslip({
    settings: MEDIALOOP_SETTINGS_UNROUNDED,
    components: NEW_SHEET_COMPONENTS,
    rules: MEDIALOOP_RULES,
    employee: employeeFromRow(row(code)),
    run: { month },
    ...extra,
  });
const amt = (r: ReturnType<typeof computePayslip>, code: string) => r.lines.find((l) => l.code === code)?.amount ?? 0;

describe("the ₹1,800 → ₹3,000 EPF change", () => {
  it("Basic ≥ ₹25,000 (gross ₹65,000): 1,800 in August, 3,000 from September; net falls by 1,200, CTC rises by 1,200", () => {
    const aug = run("003", "2026-08");
    const sep = run("003", "2026-09");
    expect([amt(aug, "EPF_EE"), amt(sep, "EPF_EE")]).toEqual([1800, 3000]);
    expect([amt(aug, "EPF_ER"), amt(sep, "EPF_ER")]).toEqual([1800, 3000]);
    expect([aug.netPay, sep.netPay]).toEqual([63000, 61800]);
    expect(sep.ctcMonthly - aug.ctcMonthly).toBe(1200);
  });
  it("Basic between the ceilings is charged on actual Basic: ₹22,500 → 2,700; ₹17,500 → 2,100", () => {
    expect([amt(run("005", "2026-08"), "EPF_EE"), amt(run("005", "2026-09"), "EPF_EE")]).toEqual([1800, 2700]);
    expect([amt(run("006", "2026-08"), "EPF_EE"), amt(run("006", "2026-09"), "EPF_EE")]).toEqual([1800, 2100]);
  });
  it("Basic ≤ ₹15,000 is unchanged", () => {
    expect([amt(run("016", "2026-08"), "EPF_EE"), amt(run("016", "2026-09"), "EPF_EE")]).toEqual([1800, 1800]);
    expect([amt(run("012", "2026-08"), "EPF_EE"), amt(run("012", "2026-09"), "EPF_EE")]).toEqual([1200, 1200]);
  });
});

describe("rule selection is by pay period", () => {
  const epf = (id: string, from: string, scope: "global" | "org" = "org"): StatutoryRule => ({
    id, scope, ruleKey: "epf", jurisdiction: null, effectiveFromMonth: from,
    params: { eeRate: 12, erRate: 12, wageBase: ["BASIC"], wageCeiling: 15000, contributeAboveCeiling: false },
  });

  it("August processed after September's rule exists still gets the old rule; the engine has no 'today'", () => {
    const rules = [epf("v1", "2000-01"), epf("v2", "2026-09")];
    expect(resolveRule(rules, "epf", "2026-08")?.id).toBe("v1");
    expect(resolveRule(rules, "epf", "2026-09")?.id).toBe("v2");
    expect(resolveRule(rules, "epf", "2027-03")?.id).toBe("v2");
  });
  it("back-to-back August then September runs each record their own version", () => {
    expect(run("001", "2026-08").ruleVersions.epf?.id).toBe("legacy-epf");
    expect(run("001", "2026-09").ruleVersions.epf?.id).toBe("epf-ceiling-25000-2026-09");
  });
  it("an org override beats the JambaHR global default, even an older one", () => {
    const rules = [epf("global-new", "2026-09", "global"), epf("org-old", "2020-01", "org")];
    expect(resolveRule(rules, "epf", "2026-10")?.id).toBe("org-old");
  });
  it("a state rule beats the state-less default for PT", () => {
    const pt = (id: string, j: string | null): StatutoryRule => ({
      id, scope: "global", ruleKey: "pt", jurisdiction: j, effectiveFromMonth: "2000-01",
      params: { measure: "earned_gross", slabs: [{ below: null, amount: 0 }] },
    });
    const rules = [pt("default", null), pt("mh", "maharashtra")];
    expect(resolveRule(rules, "pt", "2026-10", "Maharashtra")?.id).toBe("mh");
    expect(resolveRule(rules, "pt", "2026-10", "goa")?.id).toBe("default");
  });
  it("rejects a malformed pay month", () => {
    expect(() => resolveRule([], "epf", "2026-9")).toThrow(/YYYY-MM/);
  });
  it("a missing rule charges 0 and warns instead of guessing", () => {
    const r = run("001", "2026-10", { rules: MEDIALOOP_RULES.filter((x) => x.ruleKey !== "esi") });
    expect(amt(r, "ESI_EE")).toBe(0);
    expect(r.warnings).toContain("No ESI rule applies to 2026-10; charged 0");
  });
});

describe("gender as stored on employees", () => {
  it("the women's PT exemption works for 'female' / 'Female' as well as 'F'", () => {
    for (const gender of ["F", "female", "Female"]) {
      const employee = { ...employeeFromRow(row("014")), gender };
      expect(amt(run("014", "2026-10", { employee }), "PT"), gender).toBe(0);
    }
    const male = { ...employeeFromRow(row("014")), gender: "Male" };
    expect(amt(run("014", "2026-10", { employee: male }), "PT")).toBe(200);
  });
});

describe("rounding (D7)", () => {
  it("rounds each deduction and the net to the rupee", () => {
    const r = run("016", "2026-10", { settings: MEDIALOOP_SETTINGS });
    expect(amt(r, "ESI_EE")).toBe(113); // 112.50 in the sheet
    expect(amt(r, "ESI_ER")).toBe(488); // 487.50
    expect(r.totalDeductions).toBe(1800 + 113 + 200);
    expect(r.netPay).toBe(30000 - 2113);
  });
});

describe("days and proration", () => {
  it("calendar days follow the month, including February", () => {
    expect(run("001", "2026-02").basisDays).toBe(28);
    expect(run("001", "2028-02").basisDays).toBe(29);
    expect(run("001", "2026-09").basisDays).toBe(30);
  });
  it("unpaid days shrink every prorated component (gross ₹35,000, 2 LOP days in a 31-day month)", () => {
    const r = run("006", "2026-10", { run: { month: "2026-10", lopDays: 2 } });
    const factor = 29 / 31;
    expect(r.daysPaid).toBe(29);
    expect(amt(r, "BASIC")).toBeCloseTo(17500 * factor, 6);
    expect(r.grossEarnings).toBeCloseTo(35000 * factor, 0);
    expect(amt(r, "EPF_EE")).toBeCloseTo(17500 * factor * 0.12, 6); // below the ceiling: on actual Basic
  });
  it("a mid-month joiner is paid from the joining date; the EPF ceiling still caps a high earner", () => {
    const employee = { ...employeeFromRow(row("001")), dateOfJoining: "2026-10-17" };
    const r = run("001", "2026-10", { employee });
    expect(employedCalendarDays("2026-10", "2026-10-17", null)).toBe(15);
    expect(r.daysPaid).toBe(15);
    expect(amt(r, "BASIC")).toBeCloseTo(112500 * (15 / 31), 6);
    expect(amt(r, "EPF_EE")).toBe(3000); // prorated Basic 54,435 is still above ₹25,000
  });
  it("a leaver is paid up to the leaving date", () => {
    const employee = { ...employeeFromRow(row("016")), dateOfLeaving: "2026-10-10" };
    expect(run("016", "2026-10", { employee }).daysPaid).toBe(10);
  });
});

describe("components", () => {
  it("a disabled component disappears from the calculation", () => {
    const components = NEW_SHEET_COMPONENTS.map((c) => (c.code === "PT" ? { ...c, enabled: false } : c));
    const r = run("001", "2026-10", { components });
    expect(r.lines.some((l) => l.code === "PT")).toBe(false);
    expect(r.totalDeductions).toBe(3000);
  });
  it("TDS can be switched on per org and taxes a one-off bonus at the margin", () => {
    const tdsRule: StatutoryRule = {
      id: "tds", scope: "global", ruleKey: "tds", jurisdiction: null, effectiveFromMonth: "2000-01",
      params: {
        cessPct: 4,
        regimes: {
          new: { slabs: [{ upTo: 400000, rate: 0 }, { upTo: null, rate: 10 }], standardDeduction: 75000, rebateUpTo: 0, allowsDeclaredDeductions: false },
          old: { slabs: [{ upTo: null, rate: 0 }], standardDeduction: 0, rebateUpTo: 0, allowsDeclaredDeductions: true },
        },
      },
    };
    const components = NEW_SHEET_COMPONENTS.map((c) => (c.code === "TDS" ? { ...c, enabled: true } : c));
    const base = run("010", "2026-10", { components, rules: [...MEDIALOOP_RULES, tdsRule] });
    const withBonus = run("010", "2026-10", {
      components, rules: [...MEDIALOOP_RULES, tdsRule],
      run: { month: "2026-10", adjustments: [{ label: "Bonus", direction: "earning", amount: 10000 }] },
    });
    expect(base.tds?.monthsInFY).toBe(12);
    expect(amt(withBonus, "TDS") - amt(base, "TDS")).toBe(1040); // 10% + 4% cess on the bonus
    expect(withBonus.grossEarnings - base.grossEarnings).toBe(10000);
  });
  it("manual components take the amount entered for the run", () => {
    const r = run("001", "2026-10", { run: { month: "2026-10", manual: { ADVANCE: 5000 } } });
    expect(amt(r, "ADVANCE")).toBe(5000);
    expect(r.netPay).toBe(225000 - 3000 - 200 - 5000);
  });
});

describe("annual CTC from a monthly salary", () => {
  it("adds up each month under its own rule: Samruddhi FY 2026-27 = 5 × 2,26,800 + 7 × 2,28,000", () => {
    const ctc = projectAnnualCtc({
      settings: MEDIALOOP_SETTINGS, components: NEW_SHEET_COMPONENTS, rules: MEDIALOOP_RULES,
      employee: employeeFromRow(row("001")), month: "2026-10",
    });
    expect(ctc).toBe(5 * 226800 + 7 * 228000);
  });
});

describe("rule param validation", () => {
  it("accepts Medialoop's rules and rejects an open-ended slab list", () => {
    for (const r of MEDIALOOP_RULES) expect(RULE_PARAM_SCHEMAS[r.ruleKey].safeParse(r.params).success).toBe(true);
    expect(
      RULE_PARAM_SCHEMAS.pt.safeParse({ measure: "earned_gross", slabs: [{ below: 7501, amount: 0 }] }).success,
    ).toBe(false);
  });
});
