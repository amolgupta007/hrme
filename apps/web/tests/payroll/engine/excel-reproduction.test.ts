// Phase 2 step 1 acceptance: the engine reproduces Medialoop's two salary
// sheets employee by employee — every component, employer contribution, net
// and CTC — under the old EPF rule and the new one.
import { describe, expect, it } from "vitest";
import { computePayslip, type PayslipResult } from "@jambahr/shared/payroll/engine";
import { NEW_EPF_SHEET, OLD_EPF_SHEET, type SheetFixture } from "./medialoop-sheets.fixture";
import {
  MEDIALOOP_RULES,
  MEDIALOOP_SETTINGS_UNROUNDED,
  NEW_SHEET_COMPONENTS,
  OLD_SHEET_COMPONENTS,
  employeeFromRow,
} from "./medialoop-config";

const line = (r: PayslipResult, code: string) => r.lines.find((l) => l.code === code);
const amount = (r: PayslipResult, code: string) => line(r, code)?.amount ?? 0;

function expectSheet(sheet: SheetFixture, month: string, components = NEW_SHEET_COMPONENTS) {
  for (const row of sheet.rows) {
    const r = computePayslip({
      settings: MEDIALOOP_SETTINGS_UNROUNDED,
      components,
      rules: MEDIALOOP_RULES,
      employee: employeeFromRow(row),
      run: { month },
    });
    const e = row.expected as Record<string, number> & { esiApplicable: boolean };
    const at = `employee ${row.code} (${month})`;

    expect(r.daysPaid, `${at} days paid`).toBe(row.daysPaid === sheet.daysInMonth ? r.basisDays : row.daysPaid);
    for (const code of ["BASIC", "HRA", "CONV", "LTA", "COMMISSION", "SPECIAL"]) {
      if (code in e) expect(amount(r, code), `${at} ${code}`).toBeCloseTo(e[code], 2);
    }
    expect(r.grossEarnings, `${at} gross`).toBeCloseTo(e.gross, 2);
    expect(amount(r, "EPF_EE"), `${at} EPF employee`).toBeCloseTo(e.EPF_EE, 2);
    expect(amount(r, "ESI_EE"), `${at} ESI employee`).toBeCloseTo(e.ESI_EE, 2);
    expect(line(r, "ESI_EE")?.note === "not covered", `${at} ESI coverage`).toBe(!e.esiApplicable);
    expect(amount(r, "PT"), `${at} PT`).toBe(e.PT);
    expect(r.totalDeductions, `${at} total deductions`).toBeCloseTo(e.totalDeductions, 2);
    expect(r.netPay, `${at} net`).toBeCloseTo(e.net, 2);
    expect(amount(r, "EPF_ER"), `${at} EPF employer`).toBeCloseTo(e.EPF_ER, 2);
    expect(amount(r, "ESI_ER"), `${at} ESI employer`).toBeCloseTo(e.ESI_ER, 2);
    expect(amount(r, "LWF_ER"), `${at} MLWF employer`).toBeCloseTo(e.LWF_ER, 2);
    expect(r.employerContributions, `${at} employer total`).toBeCloseTo(e.employerTotal, 2);
    expect(r.ctcMonthly, `${at} CTC`).toBeCloseTo(e.ctc, 2);
    expect(r.warnings, `${at} warnings`).toEqual([]);
  }
}

describe("old-EPF sheet (₹15,000 ceiling)", () => {
  it("matches every employee for August 2026", () => {
    expectSheet(OLD_EPF_SHEET, "2026-08", OLD_SHEET_COMPONENTS);
  });
  it("uses the old EPF rule version for August", () => {
    const r = computePayslip({
      settings: MEDIALOOP_SETTINGS_UNROUNDED, components: OLD_SHEET_COMPONENTS, rules: MEDIALOOP_RULES,
      employee: employeeFromRow(OLD_EPF_SHEET.rows[0]), run: { month: "2026-08" },
    });
    expect(r.ruleVersions.epf).toEqual({ id: "ml-epf-v1", effectiveFromMonth: "2000-01" });
  });
});

describe("new-EPF sheet (₹25,000 ceiling)", () => {
  it("matches every employee for October 2026 (the sheet's month)", () => {
    expectSheet(NEW_EPF_SHEET, "2026-10");
  });
  it("matches every employee for September 2026 — the first month of the new rule, no pro-rating around the 17th", () => {
    expectSheet(NEW_EPF_SHEET, "2026-09");
  });
});
