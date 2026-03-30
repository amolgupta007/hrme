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

  // Rebate u/s 87A: no tax if taxable income ≤ ₹12L
  if (taxableIncome <= 1200000) tax = 0;

  // Health & Education Cess: 4%
  return Math.max(0, Math.round(tax * 1.04));
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
}

export function computeCTCBreakdown(
  ctc: number,
  state: string = "other",
  isMetro: boolean = true,
  includeHra: boolean = true
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

  const employeePfMonthly = Math.min(Math.round(basicMonthly * 0.12), 1800);
  const ptMonthly = getProfessionalTax(grossMonthly, state);

  // TDS — new regime
  const standardDeduction = 75000;
  const annualTaxableIncome = Math.max(0, grossAnnual - employeePfMonthly * 12 - standardDeduction);
  const annualTax = computeNewRegimeTax(annualTaxableIncome);
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
  };
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
