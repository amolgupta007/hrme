"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult, Organization, LeavePolicy } from "@/types";
import type { OnboardingStepConfig } from "@/config/onboarding";
import { getPerformanceSettings, type PerformanceSettings } from "@/lib/performance-settings";

// ---- Context helper ----

async function getOrgContext(): Promise<{ orgId: string } | null> {
  const { orgId: sessionOrgId, userId } = auth();
  if (!userId) return null;

  let clerkOrgId = sessionOrgId ?? null;
  if (!clerkOrgId) {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }
  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!data) return null;
  return { orgId: (data as { id: string }).id };
}

// ---- Organization Profile ----

export type OrgProfile = Pick<Organization, "id" | "name" | "slug" | "plan" | "max_employees"> & {
  employee_count: number;
  billing_cycle: "monthly" | "annual" | null;
  platform_fee_paid: number;
};

export async function getOrgProfile(): Promise<ActionResult<OrgProfile>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, max_employees, billing_cycle, platform_fee_paid")
    .eq("id", ctx.orgId)
    .single();

  if (error || !org) return { success: false, error: "Organization not found" };

  const { count } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("status", "active");

  const orgRow = org as unknown as Organization & {
    billing_cycle: "monthly" | "annual" | null;
    platform_fee_paid: number | null;
  };

  return {
    success: true,
    data: {
      id: orgRow.id,
      name: orgRow.name,
      slug: orgRow.slug,
      plan: orgRow.plan,
      max_employees: orgRow.max_employees,
      employee_count: count ?? 0,
      billing_cycle: orgRow.billing_cycle ?? null,
      platform_fee_paid: orgRow.platform_fee_paid ?? 0,
    },
  };
}

const orgProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

export async function updateOrgProfile(
  data: z.infer<typeof orgProfileSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update org settings" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = orgProfileSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("organizations")
    .update({ name: validated.data.name })
    .eq("id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---- Leave Policies ----

const leavePolicySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["paid", "unpaid", "sick", "casual", "maternity", "paternity", "custom"]),
  days_per_year: z.number().min(1).max(365),
  carry_forward: z.boolean(),
  max_carry_forward_days: z.number().min(0).max(365),
  requires_approval: z.boolean(),
});

export async function addLeavePolicy(
  data: z.infer<typeof leavePolicySchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage leave policies" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = leavePolicySchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("leave_policies").insert({
    org_id: ctx.orgId,
    ...validated.data,
    applicable_from_months: 0,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/leaves");
  return { success: true, data: undefined };
}

export async function updateLeavePolicy(
  id: string,
  data: z.infer<typeof leavePolicySchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage leave policies" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = leavePolicySchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("leave_policies")
    .update(validated.data)
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/leaves");
  return { success: true, data: undefined };
}

export async function deleteLeavePolicy(id: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage leave policies" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Block delete if active/pending requests reference this policy
  const { count } = await supabase
    .from("leave_requests")
    .select("*", { count: "exact", head: true })
    .eq("policy_id", id)
    .in("status", ["pending", "approved"]);

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: "Cannot delete — there are active or approved leave requests using this policy.",
    };
  }

  const { error } = await supabase
    .from("leave_policies")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/leaves");
  return { success: true, data: undefined };
}

export async function listSettingsPolicies(): Promise<ActionResult<LeavePolicy[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leave_policies")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("name");

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function toggleJambaHire(enabled: boolean): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage products" };

  const supabase = createAdminSupabase();

  // Read current settings then merge
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = (org as any)?.settings ?? {};
  const newSettings = { ...currentSettings, jambahire_enabled: enabled };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function toggleAttendance(enabled: boolean): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage features" };

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = (org as any)?.settings ?? {};
  // When disabling attendance, also disable payroll integration
  const newSettings = enabled
    ? { ...currentSettings, attendance_enabled: true }
    : { ...currentSettings, attendance_enabled: false, attendance_payroll_enabled: false };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function toggleAttendancePayroll(enabled: boolean): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage features" };

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = (org as any)?.settings ?? {};
  const newSettings = { ...currentSettings, attendance_payroll_enabled: enabled };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function toggleGrievances(enabled: boolean): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can manage features" };

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = (org as any)?.settings ?? {};
  const newSettings = { ...currentSettings, grievances_enabled: enabled };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function updateOnboardingSteps(
  steps: OnboardingStepConfig[]
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update onboarding settings" };

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = (org as any)?.settings ?? {};
  const newSettings = { ...currentSettings, onboarding_steps: steps };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

const performanceSettingsSchema = z.object({
  rating_labels: z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
  ]),
  rating_labels_3: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  rating_labels_10_anchors: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  competencies: z.array(z.string().min(1)).max(8),
  self_review_required: z.boolean(),
});

export async function updatePerformanceSettings(
  data: PerformanceSettings
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update performance settings" };

  const validated = performanceSettingsSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();

  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const currentSettings = ((org as any)?.settings ?? {}) as Record<string, any>;
  const newSettings = { ...currentSettings, performance: validated.data };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: newSettings })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
