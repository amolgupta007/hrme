export type OrgPlan = "starter" | "growth" | "business" | "custom";

export type PlanFeature =
  | "documents"
  | "reviews"
  | "objectives"
  | "training"
  | "payroll"
  | "analytics"
  | "api"
  | "ai_assistant"
  | "ai_reviews"
  | "ai_attrition"
  | "semantic_search"
  | "hiring_jd"
  | "ats"
  | "interview_scheduling"
  | "offer_letters"
  | "onboarding_workflows";

export const PLAN_FEATURES: Record<OrgPlan, PlanFeature[]> = {
  starter: [],
  growth: [
    "documents",
    "reviews",
    "objectives",
    "training",
    "hiring_jd",
  ],
  business: [
    "documents",
    "reviews",
    "objectives",
    "training",
    "hiring_jd",
    "payroll",
    "analytics",
    "api",
    "ai_assistant",
    "ai_reviews",
    "ai_attrition",
    "semantic_search",
    "ats",
    "interview_scheduling",
    "offer_letters",
    "onboarding_workflows",
  ],
  // Phase 3: per-org feature set read at runtime from custom_features JSONB column
  custom: [],
};

export function hasFeature(plan: OrgPlan, feature: PlanFeature): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export const PLAN_LABELS: Record<OrgPlan, string> = {
  starter: "Starter",
  growth: "Growth",
  business: "Business",
  custom: "Custom",
};

export const PLAN_COLORS: Record<OrgPlan, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-teal-100 text-teal-700",
  business: "bg-amber-100 text-amber-700",
  custom: "bg-amber-100 text-amber-700",
};

// What each paid plan unlocks — shown in the upgrade gate
export const PLAN_UNLOCK_HIGHLIGHTS: Record<"growth" | "business", string[]> = {
  growth: [
    "Document hub with acknowledgment tracking",
    "Performance review cycles",
    "OKR & objectives management",
    "Training & compliance tracking",
    "AI job description generator",
  ],
  business: [
    "Everything in Growth",
    "Payroll & compensation management",
    "Advanced analytics dashboard",
    "Public API access",
    "AI HR assistant",
    "AI smart review summaries",
    "AI attrition risk scoring",
    "Semantic document search",
    "Full hiring suite (ATS, interviews, offers)",
    "Onboarding workflows",
  ],
};
