// Statutory calculators. Every rate, ceiling and slab comes from rule params —
// nothing statutory is hard-coded here. Pure.
import type { EpfParams, EsiParams, LwfParams, PtParams, TaxRegimeParams, TdsParams } from "./types";

/** EPF on the PF wage, applying the wage ceiling unless contributing above it. */
export function computeEpf(wage: number, p: EpfParams) {
  const contributoryWage =
    p.wageCeiling !== null && !p.contributeAboveCeiling ? Math.min(wage, p.wageCeiling) : wage;
  return {
    contributoryWage,
    employee: (contributoryWage * p.eeRate) / 100,
    employer: (contributoryWage * p.erRate) / 100,
  };
}

/** ESI: nothing unless the eligibility measure is within the limit. */
export function computeEsi(
  wage: number,
  measures: { fixed_gross: number; earned_gross: number; wage_base: number },
  p: EsiParams,
) {
  const covered = measures[p.eligibility.measure] <= p.eligibility.max;
  return {
    covered,
    employee: covered ? (wage * p.eeRate) / 100 : 0,
    employer: covered ? (wage * p.erRate) / 100 : 0,
  };
}

/** Professional tax for one month. `monthMM` is "01".."12". */
export function computePt(measure: number, p: PtParams, gender: string | null, monthMM: string): number {
  const g = gender?.trim().toUpperCase() || null;
  if (g && p.exemptions?.some((e) => e.gender.toUpperCase() === g && measure < e.below)) return 0;

  const slab = p.slabs.find((s) => s.below === null || measure < s.below);
  let amount = slab?.amount ?? 0;

  const override = p.monthOverrides?.find((o) => o.month === monthMM && o.fromAmount === amount);
  if (override) amount = override.toAmount;
  return amount;
}

/** Labour welfare fund: only in the months it falls due. */
export function computeLwf(p: LwfParams, monthMM: string) {
  const due = p.months.includes(monthMM);
  return { due, employee: due ? p.eeAmount : 0, employer: due ? p.erAmount : 0 };
}

/** Annual income tax for a regime: progressive slabs, rebate, then cess. */
export function computeAnnualTax(taxableIncome: number, regime: TaxRegimeParams, cessPct: number): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const slab of regime.slabs) {
    const upper = slab.upTo ?? Infinity;
    if (taxableIncome > lower) tax += (Math.min(taxableIncome, upper) - lower) * (slab.rate / 100);
    if (taxableIncome <= upper) break;
    lower = upper;
  }
  // Rebate is applied before cess; the threshold is on pre-cess tax.
  if (taxableIncome <= regime.rebateUpTo) tax = 0;
  return Math.max(0, Math.round(tax * (1 + cessPct / 100)));
}

/**
 * Monthly TDS from a projection over the months the employee earns in this FY.
 * Taxable adjustments (bonus etc.) are taxed at the margin, in full, this month.
 */
export function computeTds(args: {
  monthlyTaxable: number;
  monthlyEmployeePf: number;
  monthsInFY: number;
  regime: "new" | "old";
  declaredDeductionsAnnual: number;
  taxableAdjustments: number;
  p: TdsParams;
}) {
  const r = args.p.regimes[args.regime];
  const declared = r.allowsDeclaredDeductions ? Math.max(0, args.declaredDeductionsAnnual) : 0;
  const annualTaxableIncome = Math.max(
    0,
    args.monthlyTaxable * args.monthsInFY -
      args.monthlyEmployeePf * args.monthsInFY -
      r.standardDeduction -
      declared,
  );
  const annualTax = computeAnnualTax(annualTaxableIncome, r, args.p.cessPct);
  const monthlyTds = Math.round(annualTax / args.monthsInFY);
  const adjustmentTax =
    args.taxableAdjustments > 0
      ? computeAnnualTax(annualTaxableIncome + args.taxableAdjustments, r, args.p.cessPct) - annualTax
      : 0;
  return { annualTaxableIncome, annualTax, monthlyTds, adjustmentTax };
}
