import type { OrgPlan } from "@/config/plans";
import type { BillingCycle } from "@/types";

/**
 * GST rate applied to all paid amounts in India (services).
 * Stored as a percent integer; convert to multiplier when computing.
 */
export const GST_PCT = 18;

/**
 * Annual billing = 10x monthly. Customer perception: "2 months free".
 */
export const ANNUAL_MULTIPLIER = 10;

/**
 * Plans that have a recurring charge (Starter is free; Custom is per-org).
 */
export const PAID_PLANS: ReadonlyArray<OrgPlan> = ["growth", "business", "custom"];

/**
 * One-time platform fee per tier, in paise.
 * Custom tier is founder-set per approval; this is the picker default.
 */
export const PLATFORM_FEES: Record<OrgPlan, number> = {
  starter: 0,
  growth: 299900,    // ₹2,999
  business: 699900,  // ₹6,999
  custom: 499900,    // ₹4,999 default; founder may override per-org
};

/**
 * Per-employee monthly recurring rate, in paise.
 * Custom is computed from custom_features × custom_per_feature_rate at runtime.
 */
export const PER_EMPLOYEE_MONTHLY_RATE: Record<Exclude<OrgPlan, "custom">, number> = {
  starter: 0,
  growth: 50000,    // ₹500
  business: 80000,  // ₹800
};

/**
 * Default per-feature rate for Custom plan, in paise per employee per month.
 * Founder may override at approval time.
 */
export const CUSTOM_PER_FEATURE_DEFAULT_RATE = 12000; // ₹120

/**
 * Default max employees for a new Custom plan.
 * Founder may override at approval time.
 */
export const CUSTOM_DEFAULT_MAX_EMPLOYEES = 200;

/**
 * Features individually selectable on the Custom plan picker.
 * Excludes infrastructure-only flags (api, analytics, semantic_search, ai_*)
 * which only ship as part of full Business tier.
 */
export const CUSTOM_PICKER_FEATURES: ReadonlyArray<string> = [
  "documents",
  "reviews",
  "objectives",
  "training",
  "hiring_jd",
  "payroll",
  "ats",
  "interview_scheduling",
  "offer_letters",
  "onboarding_workflows",
];

/**
 * Compute the recurring amount in paise for a paid tier.
 * Custom plans use computeCustomRecurringPaise instead.
 */
export function computeRecurringPaise(
  plan: Exclude<OrgPlan, "custom">,
  cycle: BillingCycle,
  employeeCount: number
): number {
  const monthlyRate = PER_EMPLOYEE_MONTHLY_RATE[plan];
  const monthlyAmount = monthlyRate * employeeCount;
  return cycle === "annual" ? monthlyAmount * ANNUAL_MULTIPLIER : monthlyAmount;
}

/**
 * Compute the recurring amount in paise for a Custom plan.
 */
export function computeCustomRecurringPaise(
  perFeatureRate: number,
  featureCount: number,
  employeeCount: number,
  cycle: BillingCycle
): number {
  const monthlyAmount = perFeatureRate * featureCount * employeeCount;
  return cycle === "annual" ? monthlyAmount * ANNUAL_MULTIPLIER : monthlyAmount;
}

/**
 * Compute the platform fee delta the org must pay to upgrade to a target tier.
 * Returns 0 for downgrades or sideways moves (no refund policy).
 */
export function computePlatformFeeDelta(
  targetPlatformFee: number,
  alreadyPaid: number
): number {
  return Math.max(0, targetPlatformFee - alreadyPaid);
}

/**
 * Format paise as a localized rupee string for display (e.g., 299900 → "₹2,999").
 * Does NOT include "+ GST" suffix — that's the caller's choice.
 */
export function formatPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}
