// Pure CTC computation utility — no server/client directive, usable anywhere

export const INDIAN_STATES = [
  { value: "maharashtra", label: "Maharashtra" },
  { value: "karnataka", label: "Karnataka" },
  { value: "telangana", label: "Telangana" },
  { value: "andhra pradesh", label: "Andhra Pradesh" },
  { value: "gujarat", label: "Gujarat" },
  { value: "west bengal", label: "West Bengal" },
  { value: "tamil nadu", label: "Tamil Nadu" },
  { value: "delhi", label: "Delhi (No PT)" },
  { value: "haryana", label: "Haryana (No PT)" },
  { value: "rajasthan", label: "Rajasthan (No PT)" },
  { value: "uttar pradesh", label: "Uttar Pradesh (No PT)" },
  { value: "other", label: "Other State" },
];

/**
 * Professional Tax — state-based monthly deduction.
 * Slabs hardcoded to FY 2025-26 rates. State rate revisions (MH/KA/TN/WB)
 * historically happen in April; re-verify each FY. Last verified: 2026-05.
 */
export function getProfessionalTax(grossMonthly: number, state: string): number {
  switch (state.toLowerCase()) {
    case "maharashtra":
      if (grossMonthly > 15000) return 200;
      if (grossMonthly > 10000) return 150;
      return 0;
    case "karnataka":
      return grossMonthly > 15000 ? 200 : 0;
    case "telangana":
    case "andhra pradesh":
      return grossMonthly > 15000 ? 200 : 0;
    case "gujarat":
      return grossMonthly > 6000 ? 200 : 0;
    case "tamil nadu":
      return grossMonthly > 21000 ? 182 : 0;
    case "west bengal":
      if (grossMonthly > 40000) return 200;
      if (grossMonthly > 25000) return 150;
      if (grossMonthly > 15000) return 130;
      if (grossMonthly > 10000) return 110;
      return 0;
    case "delhi":
    case "haryana":
    case "rajasthan":
    case "uttar pradesh":
      return 0;
    default:
      return grossMonthly > 10000 ? 200 : 0;
  }
}

/**
 * New Tax Regime slabs (FY 2025-26, post Budget 2025)
 * Standard Deduction: ₹75,000
 * Rebate u/s 87A: full rebate if taxable income ≤ ₹12L (effectively 0 tax)
 */
export function computeNewRegimeTax(taxableIncome: number): number {
  if (taxableIncome <= 400000) return 0;

  let tax = 0;
  // 4L–8L: 5%
  if (taxableIncome > 400000) tax += Math.min(taxableIncome - 400000, 400000) * 0.05;
  // 8L–12L: 10%
  if (taxableIncome > 800000) tax += Math.min(taxableIncome - 800000, 400000) * 0.10;
  // 12L–16L: 15%
  if (taxableIncome > 1200000) tax += Math.min(taxableIncome - 1200000, 400000) * 0.15;
  // 16L–20L: 20%
  if (taxableIncome > 1600000) tax += Math.min(taxableIncome - 1600000, 400000) * 0.20;
  // 20L–24L: 25%
  if (taxableIncome > 2000000) tax += Math.min(taxableIncome - 2000000, 400000) * 0.25;
  // 24L+: 30%
  if (taxableIncome > 2400000) tax += (taxableIncome - 2400000) * 0.30;

  // Rebate u/s 87A: no tax if taxable income ≤ ₹12L (new regime, FY 2025-26).
  // Rebate is applied BEFORE Cess per CBDT — the ₹12L threshold is on pre-Cess tax.
  if (taxableIncome <= 1200000) tax = 0;

  // Health & Education Cess: 4% — levied on the post-rebate tax.
  return Math.max(0, Math.round(tax * 1.04));
}

export type TaxRegime = "new" | "old";

/**
 * Old Tax Regime slabs (FY 2025-26).
 * Standard Deduction: ₹50,000 for salaried.
 * 87A Rebate: full rebate if taxable income ≤ ₹5L (caps at ₹12,500 of tax).
 * 80C/80D/24 deductions are passed upstream as a single `additionalDeductions`
 * catch-all — see computeCTCBreakdown.
 */
export function computeOldRegimeTax(taxableIncome: number): number {
  if (taxableIncome <= 250000) return 0;

  let tax = 0;
  // 2.5L–5L: 5%
  if (taxableIncome > 250000) tax += Math.min(taxableIncome - 250000, 250000) * 0.05;
  // 5L–10L: 20%
  if (taxableIncome > 500000) tax += Math.min(taxableIncome - 500000, 500000) * 0.20;
  // 10L+: 30%
  if (taxableIncome > 1000000) tax += (taxableIncome - 1000000) * 0.30;

  // Rebate u/s 87A: no tax if taxable income ≤ ₹5L (old-regime threshold).
  if (taxableIncome <= 500000) tax = 0;

  // Health & Education Cess: 4% on post-rebate tax.
  return Math.max(0, Math.round(tax * 1.04));
}

export function computeTaxByRegime(taxableIncome: number, regime: TaxRegime): number {
  return regime === "old" ? computeOldRegimeTax(taxableIncome) : computeNewRegimeTax(taxableIncome);
}

/**
 * Marginal tax on a one-time bonus payment, routed through the employee's regime.
 * Returns tax(annualTaxable + bonus) - tax(annualTaxable). Full marginal amount is
 * deducted in the payroll month the bonus is paid.
 */
export function computeAdditionalTaxOnBonus(
  annualTaxableIncome: number,
  bonus: number,
  regime: TaxRegime = "new"
): number {
  if (bonus <= 0) return 0;
  return computeTaxByRegime(annualTaxableIncome + bonus, regime) - computeTaxByRegime(annualTaxableIncome, regime);
}

export interface CTCBreakdown {
  ctc: number;
  // Annual components
  basicAnnual: number;
  hraAnnual: number;
  specialAllowanceAnnual: number;
  employerPfAnnual: number;
  employerGratuityAnnual: number;
  grossAnnual: number;
  // Monthly take-home components
  basicMonthly: number;
  hraMonthly: number;
  specialAllowanceMonthly: number;
  grossMonthly: number;
  // Deductions
  employeePfMonthly: number;
  employerPfMonthly: number;
  ptMonthly: number;
  tdsMonthly: number;
  totalDeductionsMonthly: number;
  netMonthly: number;
  // Tax info
  annualTaxableIncome: number;
  annualTax: number;
  taxRegime: TaxRegime;
  pfCapped: boolean;
}

export function computeCTCBreakdown(
  ctc: number,
  state: string = "other",
  isMetro: boolean = true,
  includeHra: boolean = true,
  taxRegime: TaxRegime = "new",
  additionalDeductions: number = 0
): CTCBreakdown {
  const basicAnnual = Math.round(ctc * 0.4);
  const hraAnnual = includeHra ? Math.round(basicAnnual * (isMetro ? 0.5 : 0.4)) : 0;
  const employerPfMonthly = Math.min(Math.round((basicAnnual / 12) * 0.12), 1800);
  const employerPfAnnual = employerPfMonthly * 12;
  const employerGratuityAnnual = Math.round(basicAnnual * 0.0481);
  const specialAllowanceAnnual = Math.max(
    0,
    ctc - basicAnnual - hraAnnual - employerPfAnnual - employerGratuityAnnual
  );

  const basicMonthly = Math.round(basicAnnual / 12);
  const hraMonthly = Math.round(hraAnnual / 12);
  const specialAllowanceMonthly = Math.round(specialAllowanceAnnual / 12);
  const grossMonthly = basicMonthly + hraMonthly + specialAllowanceMonthly;
  const grossAnnual = grossMonthly * 12;

  const rawEmployeePf = Math.round(basicMonthly * 0.12);
  const employeePfMonthly = Math.min(rawEmployeePf, 1800);
  // P-010: surface whether the EPF wage cap kicked in (basic > ~₹15k/mo).
  const pfCapped = rawEmployeePf > 1800;
  const ptMonthly = getProfessionalTax(grossMonthly, state);

  // TDS — regime-aware
  const standardDeduction = taxRegime === "old" ? 50000 : 75000;
  // Old regime: subtract caller's 80C/80D/24/HRA-actual catch-all. New regime disallows most deductions.
  const allowedExtraDeductions = taxRegime === "old" ? Math.max(0, additionalDeductions) : 0;
  const annualTaxableIncome = Math.max(
    0,
    grossAnnual - employeePfMonthly * 12 - standardDeduction - allowedExtraDeductions
  );
  const annualTax = computeTaxByRegime(annualTaxableIncome, taxRegime);
  const tdsMonthly = Math.round(annualTax / 12);

  const totalDeductionsMonthly = employeePfMonthly + ptMonthly + tdsMonthly;
  const netMonthly = grossMonthly - totalDeductionsMonthly;

  return {
    ctc,
    basicAnnual,
    hraAnnual,
    specialAllowanceAnnual,
    employerPfAnnual,
    employerGratuityAnnual,
    grossAnnual,
    basicMonthly,
    hraMonthly,
    specialAllowanceMonthly,
    grossMonthly,
    employeePfMonthly,
    employerPfMonthly,
    ptMonthly,
    tdsMonthly,
    totalDeductionsMonthly,
    netMonthly,
    annualTaxableIncome,
    annualTax,
    taxRegime,
    pfCapped,
  };
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
