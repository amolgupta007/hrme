import { describe, expect, it } from "vitest";
import { buildEngineCompensation } from "@/lib/payroll/my-compensation";
import { OLD_EPF_SHEET } from "./engine/medialoop-sheets.fixture";
import { MEDIALOOP_RULES, MEDIALOOP_SETTINGS, OLD_SHEET_COMPONENTS, employeeFromRow } from "./engine/medialoop-config";

const build = (code: string, extra: Partial<Parameters<typeof buildEngineCompensation>[0]> = {}) =>
  buildEngineCompensation({
    settings: MEDIALOOP_SETTINGS,
    components: OLD_SHEET_COMPONENTS,
    rules: MEDIALOOP_RULES,
    employee: employeeFromRow(OLD_EPF_SHEET.rows.find((r) => r.code === code)!),
    month: "2026-08",
    effectiveFromMonth: "2026-08",
    showEmployerContributions: false,
    ...extra,
  });

describe("My Compensation on the payroll engine (Medialoop, Aug 2026 sheet)", () => {
  it.each(OLD_EPF_SHEET.rows.map((r) => [r.code, r] as const))("employee %s matches the sheet's gross and net", (code, row) => {
    const c = build(code);
    expect(c.grossMonthly).toBe(row.expected.gross);
    expect(Math.abs(c.netMonthly - Number(row.expected.net))).toBeLessThanOrEqual(1);
  });

  it("lists the pay slip's lines: earnings and statutory deductions, no zero or TDS lines", () => {
    const c = build("016"); // Vedika: ₹30,000 gross
    expect(c.earnings.map((l) => l.label)).toContain("Basic + DA");
    expect(c.earnings.every((l) => l.amount !== 0)).toBe(true);
    expect(c.deductions.map((l) => [l.label, l.amount])).toEqual([["Provident fund", 1800], ["ESI", 113], ["Professional tax", 200]]);
    expect(c.netMonthly).toBe(27887);
  });

  it("is a full month even for a mid-month joiner", () => {
    const row = OLD_EPF_SHEET.rows.find((r) => r.code === "016")!;
    const c = build("016", { employee: { ...employeeFromRow(row), dateOfJoining: "2026-08-20" } });
    expect(c.grossMonthly).toBe(30000);
  });

  it("hides employer contributions and CTC unless the org shows them on pay slips", () => {
    const hidden = build("016");
    expect([hidden.employerContributions, hidden.ctcMonthly, hidden.ctcAnnual]).toEqual([null, null, null]);

    const shown = build("016", { showEmployerContributions: true });
    expect(shown.employerContributions!.map((l) => l.label)).toEqual(expect.arrayContaining(["Employer PF"]));
    expect(shown.ctcMonthly).toBe(30000 + shown.employerContributions!.reduce((s, l) => s + l.amount, 0));
    expect(shown.ctcAnnual).toBeGreaterThan(shown.ctcMonthly! * 11);
  });
});
