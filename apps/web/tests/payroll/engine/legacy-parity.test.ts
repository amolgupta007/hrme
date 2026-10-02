// Existing orgs move onto the engine with the "legacy" preset. This proves the
// preset reproduces today's maths — computeCTCBreakdown at structure time plus
// the per-entry formula in processPayrollRun (apps/web/src/actions/payroll.ts)
// — across a sweep of salaries, states, regimes, HRA choices, joiners and LOP.
import { describe, expect, it } from "vitest";
import {
  computeCTCBreakdown,
  computeMonthsInFY,
  computeTaxByRegime,
  DEFAULT_RATIO_CONFIG,
  type RatioConfig,
} from "@jambahr/shared/payroll/ctc";
import {
  computePayslip,
  legacyComponents,
  legacyEmployeeOverrides,
  legacySettings,
  LEGACY_GLOBAL_RULES,
} from "@jambahr/shared/payroll/engine";

type Case = {
  ctc: number; state: string; isMetro: boolean; includeHra: boolean; regime: "new" | "old";
  extra: number; doj: string | null; lop: number; workingDays: number; ratios: RatioConfig;
};

/** Copy of processPayrollRun's per-entry maths (late penalty / line items aside). */
function legacyEntry(c: Case, month: string) {
  const s = computeCTCBreakdown(c.ctc, c.state, c.isMetro, c.includeHra, c.regime, c.extra, c.ratios);
  const lopDeduction = c.lop > 0 ? Math.round((s.grossMonthly / c.workingDays) * c.lop) : 0;
  const sd = c.regime === "old" ? 50000 : 75000;
  const extra = c.regime === "old" ? c.extra : 0;
  const m = computeMonthsInFY(month, c.doj);
  const annualTaxable = Math.max(0, s.grossMonthly * m - s.employeePfMonthly * m - sd - extra);
  const tds = Math.round(computeTaxByRegime(annualTaxable, c.regime) / m);
  const total = s.employeePfMonthly + s.ptMonthly + tds + lopDeduction;
  return { s, tds, lopDeduction, total, net: Math.max(0, s.grossMonthly - total) };
}

const STATES = ["maharashtra", "karnataka", "telangana", "andhra pradesh", "gujarat", "tamil nadu", "west bengal", "delhi", "other"];
const CTCS = [120000, 180000, 250000, 300000, 375000, 480000, 562500, 600000, 750000, 900000, 1200000, 1500000, 1800000, 2400000, 3600000, 6000000];

function* cases(): Generator<Case> {
  let i = 0;
  for (const ctc of CTCS) {
    for (const state of STATES) {
      i++;
      yield {
        ctc, state,
        isMetro: i % 2 === 0,
        includeHra: i % 5 !== 0,
        regime: i % 3 === 0 ? "old" : "new",
        extra: i % 3 === 0 ? 150000 : 0,
        doj: i % 4 === 0 ? "2026-07-14" : "2020-01-01",
        lop: i % 7,
        workingDays: [26, 22, 30][i % 3],
        ratios: i % 6 === 0 ? { ...DEFAULT_RATIO_CONFIG, basic_pct: 50 } : DEFAULT_RATIO_CONFIG,
      };
    }
  }
}

describe("legacy preset reproduces today's payroll", () => {
  const month = "2026-10";
  const all = [...cases()];

  it(`matches processPayrollRun for all ${all.length} sweep cases`, () => {
    for (const c of all) {
      const want = legacyEntry(c, month);
      const got = computePayslip({
        settings: legacySettings(c.workingDays),
        components: legacyComponents(c.ratios),
        rules: LEGACY_GLOBAL_RULES,
        employee: {
          employeeId: "x", state: c.state, taxRegime: c.regime, declaredDeductionsAnnual: c.extra,
          annualCtc: c.ctc, overrides: legacyEmployeeOverrides({ is_metro: c.isMetro, include_hra: c.includeHra }, c.ratios), dateOfJoining: c.doj,
        },
        run: { month, lopDays: c.lop },
      });
      const a = (code: string) => got.lines.find((l) => l.code === code)?.amount ?? 0;
      const at = JSON.stringify(c);
      expect(a("BASIC"), `${at} basic`).toBe(want.s.basicMonthly);
      expect(a("HRA"), `${at} hra`).toBe(want.s.hraMonthly);
      expect(a("SPECIAL"), `${at} special`).toBe(want.s.specialAllowanceMonthly);
      expect(got.grossEarnings, `${at} gross`).toBe(want.s.grossMonthly);
      expect(a("EPF_EE"), `${at} pf`).toBe(want.s.employeePfMonthly);
      expect(a("PT"), `${at} pt`).toBe(want.s.ptMonthly);
      expect(a("TDS"), `${at} tds`).toBe(want.tds);
      expect(a("LOP"), `${at} lop`).toBe(want.lopDeduction);
      expect(got.totalDeductions, `${at} total`).toBe(want.total);
      expect(got.netPay, `${at} net`).toBe(want.net);
      expect(got.warnings, `${at} warnings`).toEqual([]);
    }
  });
});
