import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
  typescript: true,
});

export const PLANS = {
  starter: {
    name: "Starter",
    description: "Free for up to 10 employees",
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    maxEmployees: 10,
    features: [
      "Employee directory",
      "Leave management",
      "Basic documents",
      "Email support",
    ],
  },
  growth: {
    name: "Growth",
    description: "$5/employee/month",
    priceId: process.env.STRIPE_GROWTH_PRICE_ID!,
    maxEmployees: 200,
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
    description: "$8/employee/month",
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID!,
    maxEmployees: 500,
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
