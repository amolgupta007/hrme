// Payroll engine types. Pure data — no server/client directive, usable anywhere.
// Plan: docs/planning/payroll/payroll-engine-plan.md

/** "YYYY-MM" — the PAY PERIOD. Rules are chosen by this, never by today's date. */
export type PayMonth = string;

export type ComponentKind = "earning" | "deduction" | "employer_contribution";

/**
 * fixed      — a monthly ₹ amount (org default, overridable per employee)
 * pct_of     — `pct` % of another component, or of the pseudo-bases GROSS / CTC
 * balancing  — whatever is left of gross (gross-first) or of CTC (ctc-first)
 * statutory  — computed by the rule named in `rule` (EPF, ESI, PT, LWF, TDS)
 * manual     — entered per run (salary advance, security deposit, …)
 */
export type ComponentMethod = "fixed" | "pct_of" | "balancing" | "statutory" | "manual";

export type StatutoryRuleKey = "epf" | "esi" | "pt" | "lwf" | "tds";

/** Pseudo-components a `pct_of` component may reference. */
export const BASE_GROSS = "GROSS";
export const BASE_CTC = "CTC";

export interface ComponentDef {
  code: string;
  label: string;
  kind: ComponentKind;
  method: ComponentMethod;
  /** pct_of: the component code (or GROSS / CTC) the percentage applies to. */
  base?: string;
  pct?: number;
  /** fixed: default monthly amount. */
  amount?: number;
  /** statutory: which rule computes it. Deductions get the employee share, employer_contribution the employer share. */
  rule?: StatutoryRuleKey;
  /** Scale by days paid ÷ day basis. */
  prorate: boolean;
  /** Counts as taxable salary for TDS. */
  taxable: boolean;
  enabled: boolean;
  showOnPayslip: boolean;
  order: number;
}

export type InputMode = "gross_first" | "ctc_first";

export type DayBasis = { type: "calendar_days" } | { type: "fixed_days"; days: number };

/**
 * prorate   — unpaid days shrink every prorated component (Medialoop's sheet)
 * deduction — components stay whole; a separate "Loss of pay" deduction line (JambaHR's legacy run)
 */
export type LopTreatment = "prorate" | "deduction";

export type Rounding = "none" | "rupee";

export interface PayrollSettings {
  inputMode: InputMode;
  dayBasis: DayBasis;
  lopTreatment: LopTreatment;
  /** Prorate for days before joining / after leaving within the month. */
  prorateJoinersLeavers: boolean;
  /** Rounding applied to each computed line (balancing lines always round to the rupee). */
  lineRounding: Rounding;
  netRounding: Rounding;
}

// ── Statutory rule params ──────────────────────────────────────────────────

export interface EpfParams {
  eeRate: number; // %
  erRate: number; // %
  /** Component codes whose sum is the PF wage (Basic + DA). */
  wageBase: string[];
  /** Monthly wage ceiling; null = no ceiling. */
  wageCeiling: number | null;
  /** Contribute on full wages even above the ceiling (voluntary higher PF). */
  contributeAboveCeiling: boolean;
}

export interface EsiParams {
  eeRate: number; // %
  erRate: number; // %
  /** Component codes whose sum is the ESI contribution wage. */
  wageBase: string[];
  /** Who is covered: `measure` must be ≤ `max`. */
  eligibility: { measure: "fixed_gross" | "earned_gross" | "wage_base"; max: number };
}

export interface PtSlab {
  /** Applies when the measure is strictly below this; null = no upper bound. */
  below: number | null;
  amount: number;
}

export interface PtParams {
  measure: "earned_gross" | "fixed_gross";
  slabs: PtSlab[];
  /** e.g. women earning below a limit pay nothing. */
  exemptions?: { gender: string; below: number }[];
  /** e.g. Maharashtra: the ₹200 slab is ₹300 in February ("02"). */
  monthOverrides?: { month: string; fromAmount: number; toAmount: number }[];
}

export interface LwfParams {
  eeAmount: number;
  erAmount: number;
  /** "MM" months the contribution is due, e.g. ["06","12"]. */
  months: string[];
}

export interface TaxSlab {
  /** Upper bound of this slab; null = no bound. Slabs are ordered ascending. */
  upTo: number | null;
  rate: number; // %
}

export interface TaxRegimeParams {
  slabs: TaxSlab[];
  standardDeduction: number;
  /** Tax is zero when taxable income ≤ this (87A). 0 = no rebate. */
  rebateUpTo: number;
  /** Whether employee-declared deductions (80C etc.) are allowed. */
  allowsDeclaredDeductions: boolean;
}

export interface TdsParams {
  cessPct: number;
  regimes: { new: TaxRegimeParams; old: TaxRegimeParams };
}

export type RuleParams = {
  epf: EpfParams;
  esi: EsiParams;
  pt: PtParams;
  lwf: LwfParams;
  tds: TdsParams;
};

export interface StatutoryRule<K extends StatutoryRuleKey = StatutoryRuleKey> {
  id: string;
  /** global = JambaHR-maintained default; org = that org's override. */
  scope: "global" | "org";
  ruleKey: K;
  /** State code for PT / LWF; null = applies everywhere. */
  jurisdiction: string | null;
  effectiveFromMonth: PayMonth;
  params: RuleParams[K];
}

// ── Engine input / output ──────────────────────────────────────────────────

export interface EmployeePayInput {
  employeeId: string;
  gender?: string | null;
  /** PT/LWF jurisdiction (state code). */
  state?: string | null;
  taxRegime?: "new" | "old";
  /** Old-regime declared deductions (80C/80D/24…), annual. */
  declaredDeductionsAnnual?: number;
  /** gross_first: fixed monthly gross. */
  monthlyGross?: number;
  /** ctc_first: annual CTC. */
  annualCtc?: number;
  /** Per-employee overrides of component defaults. */
  overrides?: Record<string, { amount?: number; pct?: number }>;
  dateOfJoining?: string | null; // YYYY-MM-DD
  dateOfLeaving?: string | null; // YYYY-MM-DD
}

export interface Adjustment {
  label: string;
  direction: "earning" | "deduction";
  amount: number;
  /** Earnings only: adds marginal TDS when TDS is enabled. */
  taxable?: boolean;
  code?: string;
}

export interface RunInput {
  month: PayMonth;
  /** Unpaid days, already resolved from the org's LOP source by the caller. */
  lopDays?: number;
  /**
   * The employee's week-offs and non-optional holidays in this month
   * (YYYY-MM-DD), resolved by the caller. Joiner/leaver proration ignores
   * off days at the month's edges: joining on the first working day pays
   * the whole month.
   */
  nonWorkingDates?: readonly string[];
  /** Late-arrival penalty days, charged at the same per-day rate as LOP. */
  latePenaltyDays?: number;
  /** Amounts for `manual` components, by code. */
  manual?: Record<string, number>;
  /** One-off adjustments for this run only. */
  adjustments?: Adjustment[];
}

export interface PayslipLine {
  code: string;
  label: string;
  kind: ComponentKind;
  amount: number;
  source: "component" | "adjustment" | "lop" | "late_penalty";
  showOnPayslip: boolean;
  order: number;
  /** For % and statutory lines: the base the rate applied to, and the rate. */
  base?: number;
  rate?: number;
  ruleId?: string;
  /** e.g. "not covered" for ESI above the eligibility limit. */
  note?: string;
}

export interface TdsProjection {
  regime: "new" | "old";
  monthsInFY: number;
  annualTaxableIncome: number;
  annualTax: number;
  monthlyTds: number;
  adjustmentTax: number;
}

export interface PayslipResult {
  month: PayMonth;
  basisDays: number;
  daysPaid: number;
  prorationFactor: number;
  lines: PayslipLine[];
  grossEarnings: number;
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
  /** Earned gross + employer contributions, for this month. */
  ctcMonthly: number;
  /** Rule versions used, by key. Recorded on the processed run. */
  ruleVersions: Partial<Record<StatutoryRuleKey, { id: string; effectiveFromMonth: PayMonth }>>;
  tds?: TdsProjection;
  warnings: string[];
}
