// Medialoop's payroll configuration, as their two salary sheets encode it.
// This is the shape the org's settings/components/rules will be seeded with
// (Phase 2 step 2); here it drives the Excel-reproduction tests.
import type {
  ComponentDef,
  EmployeePayInput,
  PayrollSettings,
  StatutoryRule,
} from "@jambahr/shared/payroll/engine";
import type { SheetRow } from "./medialoop-sheets.fixture";

/** The sheets keep paise; rounding is tested separately. */
export const MEDIALOOP_SETTINGS_UNROUNDED: PayrollSettings = {
  inputMode: "gross_first",
  dayBasis: { type: "calendar_days" },
  lopTreatment: "prorate",
  prorateJoinersLeavers: true,
  lineRounding: "none",
  netRounding: "none",
};

export const MEDIALOOP_SETTINGS: PayrollSettings = {
  ...MEDIALOOP_SETTINGS_UNROUNDED,
  lineRounding: "rupee",
  netRounding: "rupee",
};

const comp = (c: Partial<ComponentDef> & Pick<ComponentDef, "code" | "label" | "kind" | "method" | "order">): ComponentDef => ({
  prorate: true, taxable: true, enabled: true, showOnPayslip: true, ...c,
});

function components(hraPct: number, withCommission: boolean): ComponentDef[] {
  return [
    comp({ code: "BASIC", label: "Basic + DA", kind: "earning", method: "pct_of", base: "GROSS", pct: 50, order: 10 }),
    comp({ code: "HRA", label: "HRA", kind: "earning", method: "pct_of", base: "BASIC", pct: hraPct, order: 20 }),
    comp({ code: "CONV", label: "Conveyance allowance", kind: "earning", method: "fixed", amount: 0, order: 30 }),
    comp({ code: "LTA", label: "Leave travel allowance", kind: "earning", method: "fixed", amount: 0, order: 40 }),
    comp({ code: "COMMISSION", label: "Commission", kind: "earning", method: "fixed", amount: 0, order: 50, enabled: withCommission }),
    comp({ code: "SPECIAL", label: "Special allowance", kind: "earning", method: "balancing", order: 90 }),
    comp({ code: "TDS", label: "Income tax", kind: "deduction", method: "statutory", rule: "tds", order: 100, enabled: false }),
    comp({ code: "ADVANCE", label: "Salary advance", kind: "deduction", method: "manual", order: 105 }),
    comp({ code: "DEPOSIT", label: "Security deposit", kind: "deduction", method: "manual", order: 106 }),
    comp({ code: "EPF_EE", label: "Provident fund", kind: "deduction", method: "statutory", rule: "epf", order: 110 }),
    comp({ code: "ESI_EE", label: "ESI", kind: "deduction", method: "statutory", rule: "esi", order: 115 }),
    comp({ code: "LWF_EE", label: "MLWF", kind: "deduction", method: "statutory", rule: "lwf", order: 118 }),
    comp({ code: "PT", label: "Professional tax", kind: "deduction", method: "statutory", rule: "pt", order: 120 }),
    comp({ code: "EPF_ER", label: "Employer PF", kind: "employer_contribution", method: "statutory", rule: "epf", order: 210, showOnPayslip: false }),
    comp({ code: "ESI_ER", label: "Employer ESI", kind: "employer_contribution", method: "statutory", rule: "esi", order: 215, showOnPayslip: false }),
    comp({ code: "LWF_ER", label: "Employer MLWF", kind: "employer_contribution", method: "statutory", rule: "lwf", order: 218, showOnPayslip: false }),
  ];
}

/** Old sheet: HRA 50% of Basic; conveyance, LTA, commission per employee. */
export const OLD_SHEET_COMPONENTS = components(50, true);
/** New sheet: HRA 40% of Basic; LTA + conveyance per employee; commission gone. */
export const NEW_SHEET_COMPONENTS = components(40, false);

export const MEDIALOOP_RULES: StatutoryRule[] = [
  {
    id: "ml-epf-v1", scope: "org", ruleKey: "epf", jurisdiction: null, effectiveFromMonth: "2000-01",
    params: { eeRate: 12, erRate: 12, wageBase: ["BASIC"], wageCeiling: 15000, contributeAboveCeiling: false },
  },
  {
    id: "ml-epf-v2", scope: "org", ruleKey: "epf", jurisdiction: null, effectiveFromMonth: "2026-09",
    params: { eeRate: 12, erRate: 12, wageBase: ["BASIC"], wageCeiling: 25000, contributeAboveCeiling: false },
  },
  {
    // Both sheets: contribution on Basic; covered while fixed gross ≤ ₹42,000.
    id: "ml-esi", scope: "org", ruleKey: "esi", jurisdiction: null, effectiveFromMonth: "2000-01",
    params: { eeRate: 0.75, erRate: 3.25, wageBase: ["BASIC"], eligibility: { measure: "fixed_gross", max: 42000 } },
  },
  {
    // Sheet: AG<7501 → 0, AG<10001 → 175, else 200; two women at ≤ ₹25,000 typed "NA".
    id: "ml-pt-mh", scope: "org", ruleKey: "pt", jurisdiction: "maharashtra", effectiveFromMonth: "2000-01",
    params: {
      measure: "earned_gross",
      slabs: [{ below: 7501, amount: 0 }, { below: 10001, amount: 175 }, { below: null, amount: 200 }],
      exemptions: [{ gender: "F", below: 25001 }],
    },
  },
  {
    // Sheet: MLWF typed 0, employer = 3 × employee. Amounts/months are the org's to set.
    id: "ml-lwf-mh", scope: "org", ruleKey: "lwf", jurisdiction: "maharashtra", effectiveFromMonth: "2000-01",
    params: { eeAmount: 0, erAmount: 0, months: [] },
  },
];

export function employeeFromRow(row: SheetRow): EmployeePayInput {
  const overrides: EmployeePayInput["overrides"] = {};
  for (const [code, amount] of Object.entries(row.fixed)) overrides[code] = { amount };
  return {
    employeeId: row.code,
    gender: row.gender,
    state: "maharashtra",
    monthlyGross: row.gross,
    overrides,
  };
}
