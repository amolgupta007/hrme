"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { razorpay } from "@/lib/razorpay";
import { computePlatformFeeDelta, ANNUAL_MULTIPLIER } from "@/config/billing";
import { render } from "@react-email/render";
import { resend, NOREPLY_EMAIL } from "@/lib/resend";
import { CustomPlanCounterOfferEmail } from "@/components/emails/custom-plan-counter-offer";
import { CustomPlanRejectedEmail } from "@/components/emails/custom-plan-rejected";
import { CustomPlanApprovedEmail } from "@/components/emails/custom-plan-approved";
import type { ActionResult } from "@/types";

export type CustomPlanRequestRow = {
  id: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  requested_features: string[];
  requested_employees: number;
  requested_billing_cycle: "monthly" | "annual";
  status: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled";
  founder_platform_fee: number | null;
  founder_per_feature_rate: number | null;
  founder_max_employees: number | null;
  founder_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

function unauth(): ActionResult {
  return { success: false, error: "Not authorized" };
}

export async function listCustomPlanRequests(): Promise<ActionResult<CustomPlanRequestRow[]>> {
  if (!isSuperadminAuthenticated()) return unauth() as ActionResult<CustomPlanRequestRow[]>;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("custom_plan_requests")
    .select(
      "id, org_id, requested_features, requested_employees, requested_billing_cycle, status, founder_platform_fee, founder_per_feature_rate, founder_max_employees, founder_notes, rejection_reason, created_at, organizations:org_id(name, slug)"
    )
    .in("status", ["pending", "counter_offered", "accepted"])
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    org_id: r.org_id,
    org_name: r.organizations?.name ?? "—",
    org_slug: r.organizations?.slug ?? "",
    requested_features: r.requested_features ?? [],
    requested_employees: r.requested_employees,
    requested_billing_cycle: r.requested_billing_cycle,
    status: r.status,
    founder_platform_fee: r.founder_platform_fee,
    founder_per_feature_rate: r.founder_per_feature_rate,
    founder_max_employees: r.founder_max_employees,
    founder_notes: r.founder_notes,
    rejection_reason: r.rejection_reason,
    created_at: r.created_at,
  }));
  return { success: true, data: rows };
}

export async function counterOfferCustomPlan(args: {
  requestId: string;
  platformFee: number;
  perFeatureRate: number;
  maxEmployees: number;
  notes: string;
}): Promise<ActionResult> {
  if (!isSuperadminAuthenticated()) return unauth();

  const supabase = createAdminSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("custom_plan_requests")
    .select(
      "id, org_id, requested_features, requested_employees, requested_billing_cycle, organizations:org_id(name)"
    )
    .eq("id", args.requestId)
    .single();
  if (fetchError || !row) return { success: false, error: fetchError?.message ?? "Request not found" };

  const r = row as any;
  const { error: updateError } = await supabase
    .from("custom_plan_requests")
    .update({
      status: "counter_offered",
      founder_platform_fee: args.platformFee,
      founder_per_feature_rate: args.perFeatureRate,
      founder_max_employees: args.maxEmployees,
      founder_notes: args.notes,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", args.requestId);
  if (updateError) return { success: false, error: updateError.message };

  const { data: admins } = await supabase
    .from("employees")
    .select("email")
    .eq("org_id", r.org_id)
    .in("role", ["owner", "admin"])
    .eq("status", "active");
  if (admins && admins.length > 0) {
    try {
      const html = await render(
        CustomPlanCounterOfferEmail({
          orgName: r.organizations?.name ?? "your team",
          features: r.requested_features ?? [],
          employees: r.requested_employees,
          cycle: r.requested_billing_cycle,
          platformFee: args.platformFee,
          perFeatureRate: args.perFeatureRate,
          maxEmployees: args.maxEmployees,
          notes: args.notes,
          dashboardUrl: "https://jambahr.com/dashboard/settings/custom-plan",
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR — Custom plan counter-offer",
        html,
      });
    } catch (e) {
      console.warn("counter-offer email failed", e);
    }
  }

  revalidatePath("/superadmin/dashboard");
  return { success: true, data: undefined };
}

export async function rejectCustomPlan(args: {
  requestId: string;
  reason: string;
}): Promise<ActionResult> {
  if (!isSuperadminAuthenticated()) return unauth();

  const supabase = createAdminSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("custom_plan_requests")
    .select("id, org_id, organizations:org_id(name)")
    .eq("id", args.requestId)
    .single();
  if (fetchError || !row) return { success: false, error: fetchError?.message ?? "Request not found" };

  const r = row as any;
  const { error: updateError } = await supabase
    .from("custom_plan_requests")
    .update({
      status: "rejected",
      rejection_reason: args.reason,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", args.requestId);
  if (updateError) return { success: false, error: updateError.message };

  const { data: admins } = await supabase
    .from("employees")
    .select("email")
    .eq("org_id", r.org_id)
    .in("role", ["owner", "admin"])
    .eq("status", "active");
  if (admins && admins.length > 0) {
    try {
      const html = await render(
        CustomPlanRejectedEmail({
          orgName: r.organizations?.name ?? "your team",
          reason: args.reason,
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR — Custom plan request update",
        html,
      });
    } catch (e) {
      console.warn("rejection email failed", e);
    }
  }

  revalidatePath("/superadmin/dashboard");
  return { success: true, data: undefined };
}

export async function approveCustomPlan(args: { requestId: string }): Promise<ActionResult> {
  if (!isSuperadminAuthenticated()) return unauth();

  const supabase = createAdminSupabase();
  const { data: row, error: fetchError } = await supabase
    .from("custom_plan_requests")
    .select(
      "id, org_id, requested_features, requested_employees, requested_billing_cycle, founder_platform_fee, founder_per_feature_rate, founder_max_employees, status, organizations:org_id(name, platform_fee_paid, stripe_subscription_id)"
    )
    .eq("id", args.requestId)
    .single();
  if (fetchError || !row) return { success: false, error: fetchError?.message ?? "Request not found" };

  const r = row as any;
  if (r.status !== "pending" && r.status !== "accepted") {
    return { success: false, error: `Cannot approve a request in status '${r.status}'` };
  }

  const features: string[] = r.requested_features ?? [];
  const cap: number = r.founder_max_employees ?? r.requested_employees;
  const employees: number = Math.min(r.requested_employees, cap);
  const cycle: "monthly" | "annual" = r.requested_billing_cycle;
  const perFeatureRate = r.founder_per_feature_rate ?? 12000;
  const platformFee = r.founder_platform_fee ?? 499900;
  const orgName = r.organizations?.name ?? "Custom org";
  const alreadyPaid = r.organizations?.platform_fee_paid ?? 0;
  const platformFeeDelta = computePlatformFeeDelta(platformFee, alreadyPaid);

  const perEmployeeMonthly = features.length * perFeatureRate;
  const planAmount =
    cycle === "annual" ? perEmployeeMonthly * ANNUAL_MULTIPLIER : perEmployeeMonthly;

  try {
    if (r.organizations?.stripe_subscription_id) {
      try {
        await razorpay.subscriptions.cancel(r.organizations.stripe_subscription_id, false);
      } catch (e) {
        console.warn("approveCustomPlan: cancel-old failed (continuing)", e);
      }
    }

    const plan = await (razorpay.plans as any).create({
      period: cycle === "annual" ? "yearly" : "monthly",
      interval: 1,
      item: {
        name: `JambaHR Custom — ${orgName}`,
        amount: planAmount,
        currency: "INR",
        description: `${features.length} features × ${cycle}`,
      },
      notes: {
        org_id: r.org_id,
        request_id: r.id,
      },
    });

    const subParams: Record<string, unknown> = {
      plan_id: plan.id,
      quantity: employees,
      notes: {
        org_id: r.org_id,
        plan: "custom",
        cycle,
        platform_fee_delta: String(platformFeeDelta),
        custom_request_id: r.id,
      },
    };
    if (platformFeeDelta > 0) {
      subParams.addons = [
        { item: { name: "Platform fee", amount: platformFeeDelta, currency: "INR" } },
      ];
    }
    const subscription = await (razorpay.subscriptions.create as any)(subParams);

    await supabase
      .from("custom_plan_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString() } as any)
      .eq("id", args.requestId);

    const checkoutUrl = (subscription as any).short_url ?? `https://rzp.io/i/${subscription.id}`;
    const { data: admins } = await supabase
      .from("employees")
      .select("email")
      .eq("org_id", r.org_id)
      .in("role", ["owner", "admin"])
      .eq("status", "active");
    if (admins && admins.length > 0) {
      try {
        const html = await render(
          CustomPlanApprovedEmail({
            orgName,
            features,
            employees,
            cycle,
            platformFee,
            perFeatureRate,
            checkoutUrl,
          })
        );
        await resend.emails.send({
          from: NOREPLY_EMAIL,
          to: (admins as { email: string }[]).map((a) => a.email),
          subject: "JambaHR — Your custom plan is approved",
          html,
        });
      } catch (e) {
        console.warn("approval email failed", e);
      }
    }

    revalidatePath("/superadmin/dashboard");
    return { success: true, data: undefined };
  } catch (e: any) {
    console.error("approveCustomPlan failed", e);
    await supabase
      .from("custom_plan_requests")
      .update({
        status: "pending",
        founder_notes: `Approval failed: ${e?.message ?? "unknown error"}. Retry.`,
      } as any)
      .eq("id", args.requestId);
    return { success: false, error: e?.message ?? "Failed to approve" };
  }
}
