import Razorpay from "razorpay";
import type { OrgPlan } from "@/config/plans";
import type { BillingCycle } from "@/types";

export const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export const PLAN_IDS: Record<"growth" | "business", Record<BillingCycle, string>> = {
  growth: {
    monthly: process.env.RAZORPAY_GROWTH_MONTHLY_PLAN_ID!,
    annual: process.env.RAZORPAY_GROWTH_ANNUAL_PLAN_ID!,
  },
  business: {
    monthly: process.env.RAZORPAY_BUSINESS_MONTHLY_PLAN_ID!,
    annual: process.env.RAZORPAY_BUSINESS_ANNUAL_PLAN_ID!,
  },
};

export function resolvePlanId(plan: "growth" | "business", cycle: BillingCycle): string {
  const id = PLAN_IDS[plan][cycle];
  if (!id) throw new Error(`Missing plan ID for ${plan}/${cycle}. Check env vars.`);
  return id;
}

export const MAX_EMPLOYEES: Record<Exclude<OrgPlan, "custom">, number> = {
  starter: 10,
  growth: 200,
  business: 500,
};
