import Razorpay from "razorpay";

export const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export const PLANS = {
  starter: {
    name: "Starter",
    description: "Free for up to 10 employees",
    planId: null,
    maxEmployees: 10,
    price: "Free",
    features: [
      "Employee directory",
      "Leave management",
      "Basic documents",
      "Email support",
    ],
  },
  growth: {
    name: "Growth",
    description: "₹500/employee/month",
    planId: process.env.RAZORPAY_GROWTH_PLAN_ID!,
    maxEmployees: 200,
    price: "₹500 / employee / month",
    features: [
      "Everything in Starter",
      "Performance reviews",
      "Training & compliance",
      "Custom leave policies",
      "Priority support",
    ],
  },
  business: {
    name: "Business",
    description: "₹800/employee/month",
    planId: process.env.RAZORPAY_BUSINESS_PLAN_ID!,
    maxEmployees: 500,
    price: "₹800 / employee / month",
    features: [
      "Everything in Growth",
      "Payroll & compensation",
      "Advanced analytics",
      "API access",
      "Dedicated support",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
