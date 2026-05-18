import { ASSISTANT_QUOTA, type OrgPlan } from "@/config/plans";
import type { UserRole } from "@/types";

export type AssistantAccess =
  | { allowed: true; quota: number | "unlimited"; remaining: number | "unlimited" }
  | { allowed: false; reason: "plan-locked" | "no-employee-record" | "org-disabled" };

export function getMonthlyQuota(plan: OrgPlan): number | "unlimited" {
  return ASSISTANT_QUOTA[plan];
}

export function canUseAssistant(args: {
  plan: OrgPlan;
  role: UserRole | null;
  orgEnabled: boolean;
  monthUsage: number;
}): AssistantAccess {
  if (!args.orgEnabled) return { allowed: false, reason: "org-disabled" };
  if (!args.role) return { allowed: false, reason: "no-employee-record" };
  const quota = getMonthlyQuota(args.plan);
  if (quota === 0) return { allowed: false, reason: "plan-locked" };
  if (quota === "unlimited") return { allowed: true, quota, remaining: "unlimited" };
  const remaining = Math.max(quota - args.monthUsage, 0);
  return { allowed: true, quota, remaining };
}
