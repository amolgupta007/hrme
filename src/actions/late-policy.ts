"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

export type LatePolicy = {
  id: string;
  org_id: string;
  enabled: boolean;
  name: string;
  threshold_days: number;
  fallback_cutoff_time: string | null;
  notify_on_late: boolean;
  notify_on_threshold: boolean;
  warn_at: number | null;
  channel_whatsapp: boolean;
  channel_email: boolean;
};

export type LatePolicyTargetRow = { target_type: "department" | "employee"; target_id: string };

const PolicySchema = z.object({
  enabled: z.boolean(),
  name: z.string().min(1).max(120),
  threshold_days: z.number().int().min(1).max(31),
  fallback_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  notify_on_late: z.boolean(),
  notify_on_threshold: z.boolean(),
  warn_at: z.number().int().min(1).max(31).nullable(),
  channel_whatsapp: z.boolean(),
  channel_email: z.boolean(),
  targets: z.array(z.object({ target_type: z.enum(["department", "employee"]), target_id: z.string().uuid() })),
});

export async function getLatePolicy(): Promise<
  ActionResult<{ policy: LatePolicy | null; targets: LatePolicyTargetRow[] }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data: policy } = await sb.from("late_policies").select("*").eq("org_id", user.orgId).maybeSingle();
  if (!policy) return { success: true, data: { policy: null, targets: [] } };
  const { data: targets } = await sb
    .from("late_policy_targets")
    .select("target_type, target_id")
    .eq("policy_id", (policy as any).id);
  return { success: true, data: { policy: policy as any, targets: (targets ?? []) as any } };
}

export async function upsertLatePolicy(input: z.infer<typeof PolicySchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit the late policy" };
  const parsed = PolicySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  if (parsed.data.warn_at != null && parsed.data.warn_at >= parsed.data.threshold_days) {
    return { success: false, error: "Warn-at must be below the threshold" };
  }
  const sb = createAdminSupabase();
  const { targets, ...policyFields } = parsed.data;

  const { data: existing } = await sb.from("late_policies").select("id").eq("org_id", user.orgId).maybeSingle();
  let policyId: string;
  if (existing) {
    policyId = (existing as any).id;
    const { error } = await sb
      .from("late_policies")
      .update({ ...policyFields, updated_at: new Date().toISOString() } as any)
      .eq("id", policyId);
    if (error) return { success: false, error: error.message };
  } else {
    const { data, error } = await sb
      .from("late_policies")
      .insert({ org_id: user.orgId, ...policyFields } as any)
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    policyId = (data as { id: string }).id;
  }

  await sb.from("late_policy_targets").delete().eq("policy_id", policyId);
  if (targets.length > 0) {
    const rows = targets.map((t) => ({
      org_id: user.orgId,
      policy_id: policyId,
      target_type: t.target_type,
      target_id: t.target_id,
    }));
    const { error: tErr } = await sb.from("late_policy_targets").insert(rows as any);
    if (tErr) return { success: false, error: tErr.message };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { id: policyId } };
}

export async function getLateFlagsForMonth(month: string): Promise<
  ActionResult<Array<{ employee_id: string; late_days_count: number; status: "flagged" | "overridden" }>>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("late_policy_flags")
    .select("employee_id, late_days_count, status")
    .eq("org_id", user.orgId)
    .eq("month", month);
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as any };
}

export async function overrideLateFlag(input: {
  employeeId: string;
  month: string;
  reason: string;
}): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can override" };
  if (!input.reason.trim()) return { success: false, error: "A reason is required" };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("late_policy_flags")
    .update({
      status: "overridden",
      override_by: user.employeeId ?? null,
      override_reason: input.reason.trim(),
      overridden_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("org_id", user.orgId)
    .eq("employee_id", input.employeeId)
    .eq("month", input.month);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}
