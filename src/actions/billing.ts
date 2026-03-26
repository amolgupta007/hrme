"use server";

import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { razorpay, PLANS, type PlanKey } from "@/lib/razorpay";
import type { ActionResult } from "@/types";

async function getOrgContext() {
  const { userId, orgId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();

  if (orgId) {
    const { data } = await supabase
      .from("organizations")
      .select("id, plan, stripe_customer_id")
      .eq("clerk_org_id", orgId)
      .single();
    return data ? { ...data, clerkOrgId: orgId } : null;
  }

  const memberships = await clerkClient().users.getOrganizationMembershipList({ userId });
  const firstOrg = memberships.data[0]?.organization;
  if (!firstOrg) return null;

  const { data } = await supabase
    .from("organizations")
    .select("id, plan, stripe_customer_id")
    .eq("clerk_org_id", firstOrg.id)
    .single();
  return data ? { ...data, clerkOrgId: firstOrg.id } : null;
}

export async function createSubscription(
  planKey: "growth" | "business"
): Promise<ActionResult<{ subscriptionId: string; keyId: string }>> {
  const org = await getOrgContext();
  if (!org) return { success: false, error: "Not authenticated" };

  const plan = PLANS[planKey];

  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.planId,
      total_count: 12, // 12 billing cycles (1 year)
      notes: {
        org_id: org.id,
        plan: planKey,
      },
    });

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      },
    };
  } catch (error: any) {
    console.error("Failed to create Razorpay subscription:", error);
    return { success: false, error: error.message ?? "Failed to create subscription" };
  }
}

export async function cancelSubscription(): Promise<ActionResult> {
  const org = await getOrgContext();
  if (!org) return { success: false, error: "Not authenticated" };
  if (!org.stripe_customer_id) return { success: false, error: "No active subscription" };

  try {
    await razorpay.subscriptions.cancel(org.stripe_customer_id, true);

    const supabase = createAdminSupabase();
    await supabase
      .from("organizations")
      .update({ plan: "starter", max_employees: 10, stripe_subscription_id: null, stripe_customer_id: null })
      .eq("id", org.id);

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("Failed to cancel subscription:", error);
    return { success: false, error: error.message ?? "Failed to cancel subscription" };
  }
}
