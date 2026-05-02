"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, NOREPLY_EMAIL } from "@/lib/resend";
import { CustomPlanRequestReceivedEmail } from "@/components/emails/custom-plan-request-received";
import { CUSTOM_PICKER_FEATURES } from "@/config/billing";
import type { ActionResult, BillingCycle } from "@/types";

const requestSchema = z.object({
  features: z.array(z.string()).min(1, "Pick at least one feature"),
  employeeCount: z.number().int().min(1).max(500),
  billingCycle: z.enum(["monthly", "annual"]),
});

export type CustomPlanRequest = {
  id: string;
  status: "pending" | "counter_offered" | "accepted" | "rejected" | "approved" | "cancelled";
  requested_features: string[];
  requested_employees: number;
  requested_billing_cycle: BillingCycle;
  founder_platform_fee: number | null;
  founder_per_feature_rate: number | null;
  founder_max_employees: number | null;
  founder_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function requestCustomPlan(
  args: z.infer<typeof requestSchema>
): Promise<ActionResult<{ requestId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can request a custom plan" };

  const parsed = requestSchema.safeParse(args);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const invalid = parsed.data.features.filter((f) => !CUSTOM_PICKER_FEATURES.includes(f));
  if (invalid.length > 0) {
    return { success: false, error: `Unknown features: ${invalid.join(", ")}` };
  }

  const supabase = createAdminSupabase();

  const { data: existing } = await supabase
    .from("custom_plan_requests")
    .select("id, status")
    .eq("org_id", user.orgId)
    .in("status", ["pending", "counter_offered", "accepted", "approved"])
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: "You already have an active custom plan request. Cancel it before submitting a new one.",
    };
  }

  const { data: row, error } = await supabase
    .from("custom_plan_requests")
    .insert({
      org_id: user.orgId,
      requested_by_employee_id: user.employeeId,
      requested_features: parsed.data.features,
      requested_employees: parsed.data.employeeCount,
      requested_billing_cycle: parsed.data.billingCycle,
      status: "pending",
    } as any)
    .select("id")
    .single();

  if (error || !row) {
    console.error("requestCustomPlan failed", error);
    return { success: false, error: error?.message ?? "Failed to submit request" };
  }

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", user.orgId)
      .single();
    const orgRow = org as { name: string } | null;
    if (orgRow) {
      const html = await render(
        CustomPlanRequestReceivedEmail({
          orgName: orgRow.name,
          features: parsed.data.features,
          employeeCount: parsed.data.employeeCount,
          billingCycle: parsed.data.billingCycle,
          superadminUrl: "https://jambahr.com/superadmin",
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL,
        to: ["amol@jambahr.com"],
        subject: `New custom plan request — ${orgRow.name}`,
        html,
      });
    }
  } catch (e) {
    console.warn("requestCustomPlan: founder email failed (non-fatal)", e);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/custom-plan");
  return { success: true, data: { requestId: (row as { id: string }).id } };
}

export async function getMyCustomPlanRequest(): Promise<ActionResult<CustomPlanRequest | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("custom_plan_requests")
    .select(
      "id, status, requested_features, requested_employees, requested_billing_cycle, founder_platform_fee, founder_per_feature_rate, founder_max_employees, founder_notes, rejection_reason, created_at, reviewed_at"
    )
    .eq("org_id", user.orgId)
    .in("status", ["pending", "counter_offered", "accepted", "approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, data: ((data as unknown) as CustomPlanRequest | null) ?? null };
}

export async function cancelMyCustomPlanRequest(requestId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can cancel a custom plan request" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("custom_plan_requests")
    .update({ status: "cancelled" } as any)
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .in("status", ["pending", "counter_offered"]);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/custom-plan");
  return { success: true, data: undefined };
}

export async function acceptCounterOffer(requestId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only owners and admins can accept a counter-offer" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("custom_plan_requests")
    .update({ status: "accepted" } as any)
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .eq("status", "counter_offered");

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/custom-plan");
  return { success: true, data: undefined };
}
