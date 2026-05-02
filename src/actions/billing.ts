"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { razorpay, resolvePlanId, MAX_EMPLOYEES } from "@/lib/razorpay";
import {
  PLATFORM_FEES,
  computeRecurringPaise,
  computePlatformFeeDelta,
} from "@/config/billing";
import type { ActionResult, BillingCycle } from "@/types";
import type { OrgPlan } from "@/config/plans";

type PaidPlanKey = "growth" | "business";

type OrgContext = {
  id: string;
  clerk_org_id: string;
  plan: OrgPlan;
  stripe_subscription_id: string | null;
  platform_fee_paid: number;
  billing_cycle: BillingCycle | null;
};

async function getOrgContext(): Promise<OrgContext | null> {
  const { userId, orgId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();
  const select = "id, clerk_org_id, plan, stripe_subscription_id, platform_fee_paid, billing_cycle";

  if (orgId) {
    const { data } = await supabase
      .from("organizations")
      .select(select)
      .eq("clerk_org_id", orgId)
      .single();
    return data ? ((data as unknown) as OrgContext) : null;
  }

  const memberships = await clerkClient().users.getOrganizationMembershipList({ userId });
  const firstOrg = memberships.data[0]?.organization;
  if (!firstOrg) return null;

  const { data } = await supabase
    .from("organizations")
    .select(select)
    .eq("clerk_org_id", firstOrg.id)
    .single();
  return data ? ((data as unknown) as OrgContext) : null;
}

export async function createSubscription(args: {
  planKey: PaidPlanKey;
  billingCycle: BillingCycle;
  employeeCount: number;
}): Promise<
  ActionResult<{
    subscriptionId: string;
    keyId: string;
    platformFeeDelta: number;
    recurringAmount: number;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can manage billing" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  const { planKey, billingCycle, employeeCount } = args;

  if (employeeCount < 1) return { success: false, error: "Employee count must be at least 1" };
  if (employeeCount > MAX_EMPLOYEES[planKey]) {
    return { success: false, error: `${planKey} supports up to ${MAX_EMPLOYEES[planKey]} employees` };
  }

  const platformFeeDelta = computePlatformFeeDelta(PLATFORM_FEES[planKey], org.platform_fee_paid);
  const recurringAmount = computeRecurringPaise(planKey, billingCycle, employeeCount);

  try {
    if (org.stripe_subscription_id) {
      try {
        await razorpay.subscriptions.cancel(org.stripe_subscription_id, false);
      } catch (cancelErr) {
        console.warn("Old subscription cancel failed (continuing):", cancelErr);
      }
    }

    const subscriptionParams: Record<string, unknown> = {
      plan_id: resolvePlanId(planKey, billingCycle),
      quantity: employeeCount,
      notes: {
        org_id: org.id,
        plan: planKey,
        cycle: billingCycle,
        platform_fee_delta: String(platformFeeDelta),
      },
    };

    if (platformFeeDelta > 0) {
      subscriptionParams.addons = [
        {
          item: {
            name: "Platform fee",
            amount: platformFeeDelta,
            currency: "INR",
          },
        },
      ];
    }

    const subscription = await razorpay.subscriptions.create(subscriptionParams as any);

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        platformFeeDelta,
        recurringAmount,
      },
    };
  } catch (error: any) {
    console.error("Failed to create Razorpay subscription:", error);
    return { success: false, error: error?.message ?? "Failed to create subscription" };
  }
}

export async function cancelSubscription(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can manage billing" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };
  if (!org.stripe_subscription_id) return { success: false, error: "No active subscription" };

  try {
    await razorpay.subscriptions.cancel(org.stripe_subscription_id, true);
    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Failed to cancel subscription:", error);
    return { success: false, error: error?.message ?? "Failed to cancel subscription" };
  }
}

export type BillingStatus = {
  plan: OrgPlan;
  billingCycle: BillingCycle | null;
  subscriptionStatus: string | null;
  maxEmployees: number;
  nextBillingAt: string | null;
  currentBillAmount: number | null;
  paymentMethod: string | null;
};

export async function getBillingStatus(): Promise<ActionResult<BillingStatus>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  const supabase = createAdminSupabase();
  const { data: row } = await supabase
    .from("organizations")
    .select("plan, billing_cycle, subscription_status, max_employees, stripe_subscription_id")
    .eq("id", org.id)
    .single();
  if (!row) return { success: false, error: "Organization not found" };

  const orgRow = row as {
    plan: OrgPlan;
    billing_cycle: BillingCycle | null;
    subscription_status: string | null;
    max_employees: number;
    stripe_subscription_id: string | null;
  };

  let nextBillingAt: string | null = null;

  if (orgRow.stripe_subscription_id) {
    try {
      const sub = await razorpay.subscriptions.fetch(orgRow.stripe_subscription_id);
      const chargeAt = (sub as { charge_at?: number }).charge_at;
      if (typeof chargeAt === "number") {
        nextBillingAt = new Date(chargeAt * 1000).toISOString();
      }
    } catch (e) {
      console.warn("getBillingStatus: razorpay fetch failed", e);
    }
  }

  return {
    success: true,
    data: {
      plan: orgRow.plan,
      billingCycle: orgRow.billing_cycle,
      subscriptionStatus:
        orgRow.subscription_status ?? (orgRow.plan !== "starter" ? "active" : null),
      maxEmployees: orgRow.max_employees,
      nextBillingAt,
      currentBillAmount: null,
      paymentMethod: null,
    },
  };
}

export async function pollBillingActivation(args: {
  expectedPlan: PaidPlanKey;
}): Promise<ActionResult<{ activated: boolean; plan: OrgPlan }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const org = await getOrgContext();
  if (!org) return { success: false, error: "Organization not found" };

  return {
    success: true,
    data: {
      activated: org.plan === args.expectedPlan,
      plan: org.plan,
    },
  };
}
