// Presets that reproduce JambaHR's pre-engine payroll exactly, so existing orgs
// see no change when they move onto the engine. These are the constants that
// used to be hard-coded in ../ctc.ts — they become the seed for the global
// statutory rules (migration) and the default settings for existing orgs.
//
// Deliberately NOT here: ESI and LWF (never implemented before; no global
// default is seeded from memory — orgs configure them, with norm notes).
import { DEFAULT_RATIO_CONFIG, type RatioConfig } from "../ctc";
import type { ComponentDef, PayrollSettings, PtParams, StatutoryRule, TdsParams } from "./types";

/** Today's run: CTC-first, a typed working-days number, LOP as its own line, no joiner proration. */
export function legacySettings(workingDays = 26): PayrollSettings {
  return {
    inputMode: "ctc_first",
    dayBasis: { type: "fixed_days", days: workingDays },
    lopTreatment: "deduction",
    prorateJoinersLeavers: false,
    lineRounding: "rupee",
    netRounding: "rupee",
  };
}

/** Basic % of CTC, HRA % of Basic, special = remainder, PF/PT/TDS, employer PF + gratuity. */
export function legacyComponents(ratios: RatioConfig = DEFAULT_RATIO_CONFIG): ComponentDef[] {
  const base = { prorate: true, taxable: true, enabled: true, showOnPayslip: true };
  return [
    { ...base, code: "BASIC", label: "Basic", kind: "earning", method: "pct_of", base: "CTC", pct: ratios.basic_pct, order: 10 },
    { ...base, code: "HRA", label: "HRA", kind: "earning", method: "pct_of", base: "BASIC", pct: ratios.hra_pct_metro, order: 20 },
    { ...base, code: "SPECIAL", label: "Special allowance", kind: "earning", method: "balancing", order: 90 },
    { ...base, code: "EPF_EE", label: "Provident fund", kind: "deduction", method: "statutory", rule: "epf", order: 110 },
    { ...base, code: "PT", label: "Professional tax", kind: "deduction", method: "statutory", rule: "pt", order: 120 },
    { ...base, code: "TDS", label: "Income tax", kind: "deduction", method: "statutory", rule: "tds", order: 100 },
    { ...base, code: "EPF_ER", label: "Employer PF", kind: "employer_contribution", method: "statutory", rule: "epf", order: 210, showOnPayslip: false },
    { ...base, code: "GRATUITY", label: "Gratuity", kind: "employer_contribution", method: "pct_of", base: "BASIC", pct: ratios.gratuity_pct, order: 220, showOnPayslip: false },
  ];
}

/** Per-employee overrides that carry a legacy salary_structures row's choices. */
export function legacyEmployeeOverrides(
  s: { is_metro: boolean; include_hra: boolean },
  ratios: RatioConfig = DEFAULT_RATIO_CONFIG,
): Record<string, { pct: number }> {
  return { HRA: { pct: s.include_hra ? (s.is_metro ? ratios.hra_pct_metro : ratios.hra_pct_non_metro) : 0 } };
}

const LEGACY_FROM = "2000-01";

const pt = (id: string, jurisdiction: string | null, slabs: PtParams["slabs"]): StatutoryRule<"pt"> => ({
  id, scope: "global", ruleKey: "pt", jurisdiction, effectiveFromMonth: LEGACY_FROM,
  params: { measure: "earned_gross", slabs },
});

export const LEGACY_TDS_PARAMS: TdsParams = {
  cessPct: 4,
  regimes: {
    new: {
      slabs: [
        { upTo: 400000, rate: 0 }, { upTo: 800000, rate: 5 }, { upTo: 1200000, rate: 10 },
        { upTo: 1600000, rate: 15 }, { upTo: 2000000, rate: 20 }, { upTo: 2400000, rate: 25 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 75000,
      rebateUpTo: 1200000,
      allowsDeclaredDeductions: false,
    },
    old: {
      slabs: [{ upTo: 250000, rate: 0 }, { upTo: 500000, rate: 5 }, { upTo: 1000000, rate: 20 }, { upTo: null, rate: 30 }],
      standardDeduction: 50000,
      rebateUpTo: 500000,
      allowsDeclaredDeductions: true,
    },
  },
};

/**
 * Global rules equal to the old hard-coded constants (FY 2025-26 as coded).
 * PT jurisdictions use the old state keys; "other" is the state-less default.
 * Slabs use strict "below" bounds: legacy `gross > 15000` ≡ below 15001 for
 * whole-rupee gross, which the legacy structure always was.
 */
export const LEGACY_GLOBAL_RULES: StatutoryRule[] = [
  {
    id: "legacy-epf", scope: "global", ruleKey: "epf", jurisdiction: null, effectiveFromMonth: LEGACY_FROM,
    params: { eeRate: 12, erRate: 12, wageBase: ["BASIC"], wageCeiling: 15000, contributeAboveCeiling: false },
  },
  { id: "legacy-tds", scope: "global", ruleKey: "tds", jurisdiction: null, effectiveFromMonth: LEGACY_FROM, params: LEGACY_TDS_PARAMS },
  pt("legacy-pt-maharashtra", "maharashtra", [{ below: 10001, amount: 0 }, { below: 15001, amount: 150 }, { below: null, amount: 200 }]),
  pt("legacy-pt-karnataka", "karnataka", [{ below: 15001, amount: 0 }, { below: null, amount: 200 }]),
  pt("legacy-pt-telangana", "telangana", [{ below: 15001, amount: 0 }, { below: null, amount: 200 }]),
  pt("legacy-pt-andhra-pradesh", "andhra pradesh", [{ below: 15001, amount: 0 }, { below: null, amount: 200 }]),
  pt("legacy-pt-gujarat", "gujarat", [{ below: 6001, amount: 0 }, { below: null, amount: 200 }]),
  pt("legacy-pt-tamil-nadu", "tamil nadu", [{ below: 21001, amount: 0 }, { below: null, amount: 182 }]),
  pt("legacy-pt-west-bengal", "west bengal", [
    { below: 10001, amount: 0 }, { below: 15001, amount: 110 }, { below: 25001, amount: 130 },
    { below: 40001, amount: 150 }, { below: null, amount: 200 },
  ]),
  pt("legacy-pt-delhi", "delhi", [{ below: null, amount: 0 }]),
  pt("legacy-pt-haryana", "haryana", [{ below: null, amount: 0 }]),
  pt("legacy-pt-rajasthan", "rajasthan", [{ below: null, amount: 0 }]),
  pt("legacy-pt-uttar-pradesh", "uttar pradesh", [{ below: null, amount: 0 }]),
  pt("legacy-pt-default", null, [{ below: 10001, amount: 0 }, { below: null, amount: 200 }]),
];
