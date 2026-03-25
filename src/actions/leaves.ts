"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult, LeavePolicy, LeaveRequest } from "@/types";

// ---- Context helper ----

async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
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
  return { orgId: (data as { id: string }).id, clerkUserId: userId };
}

// ---- Default policies ----

const DEFAULT_POLICIES = [
  { name: "Annual Leave", type: "paid" as const, days_per_year: 21, carry_forward: true, max_carry_forward_days: 5 },
  { name: "Sick Leave", type: "sick" as const, days_per_year: 10, carry_forward: false, max_carry_forward_days: 0 },
  { name: "Casual Leave", type: "casual" as const, days_per_year: 7, carry_forward: false, max_carry_forward_days: 0 },
];

async function ensureDefaultPolicies(orgId: string) {
  const supabase = createAdminSupabase();
  const { data: existing } = await supabase
    .from("leave_policies")
    .select("name")
    .eq("org_id", orgId);

  const existingNames = new Set((existing ?? []).map((p: { name: string }) => p.name));
  const toInsert = DEFAULT_POLICIES.filter((p) => !existingNames.has(p.name));

  if (toInsert.length > 0) {
    await supabase.from("leave_policies").insert(
      toInsert.map((p) => ({ ...p, org_id: orgId, requires_approval: true, applicable_from_months: 0 }))
    );
  }
}

// ---- Actions ----

export type LeaveRequestWithDetails = LeaveRequest & {
  employee_name: string;
  policy_name: string;
  policy_type: string;
};

export type EmployeeBalance = {
  employee_id: string;
  policy_id: string;
  used_days: number;
};

export type PolicyWithUsage = LeavePolicy & {
  used_days: number;
  remaining_days: number;
};

export async function listLeavePolicies(): Promise<ActionResult<PolicyWithUsage[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  await ensureDefaultPolicies(ctx.orgId);

  const supabase = createAdminSupabase();
  const currentYear = new Date().getFullYear();

  const { data: policies, error } = await supabase
    .from("leave_policies")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("name");

  if (error) return { success: false, error: error.message };

  // Calculate used days per policy from approved requests this year
  const { data: approved } = await supabase
    .from("leave_requests")
    .select("policy_id, days")
    .eq("org_id", ctx.orgId)
    .eq("status", "approved")
    .gte("start_date", `${currentYear}-01-01`)
    .lte("end_date", `${currentYear}-12-31`);

  const usedByPolicy: Record<string, number> = {};
  for (const req of approved ?? []) {
    usedByPolicy[req.policy_id] = (usedByPolicy[req.policy_id] ?? 0) + Number(req.days);
  }

  const result = (policies ?? []).map((p: LeavePolicy) => ({
    ...p,
    used_days: usedByPolicy[p.id] ?? 0,
    remaining_days: Math.max(0, p.days_per_year - (usedByPolicy[p.id] ?? 0)),
  }));

  return { success: true, data: result };
}

export async function listLeaveRequests(status?: string): Promise<ActionResult<LeaveRequestWithDetails[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  let query = supabase
    .from("leave_requests")
    .select("*, employees!employee_id(first_name, last_name), leave_policies(name, type)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const requests = (data ?? []).map((r: any) => ({
    ...r,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    policy_name: r.leave_policies?.name ?? "Unknown",
    policy_type: r.leave_policies?.type ?? "custom",
  }));

  return { success: true, data: requests };
}

/** Per-employee used days per policy for current year — used for balance checking in the form */
export async function listEmployeeBalances(): Promise<ActionResult<EmployeeBalance[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const currentYear = new Date().getFullYear();
  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("leave_requests")
    .select("employee_id, policy_id, days")
    .eq("org_id", ctx.orgId)
    .eq("status", "approved")
    .gte("start_date", `${currentYear}-01-01`)
    .lte("end_date", `${currentYear}-12-31`);

  if (error) return { success: false, error: error.message };

  // Aggregate used days per employee+policy
  const map: Record<string, EmployeeBalance> = {};
  for (const row of data ?? []) {
    const key = `${row.employee_id}__${row.policy_id}`;
    if (!map[key]) map[key] = { employee_id: row.employee_id, policy_id: row.policy_id, used_days: 0 };
    map[key].used_days += Number(row.days);
  }

  return { success: true, data: Object.values(map) };
}

const requestLeaveSchema = z.object({
  employeeId: z.string().uuid("Select an employee"),
  policyId: z.string().uuid("Select a leave type"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  days: z.number().min(0.5, "Must be at least 0.5 days"),
  reason: z.string().optional(),
  ticketNumber: z.string().optional(),
  exceedsBalance: z.boolean().default(false),
});

export async function requestLeave(
  formData: z.infer<typeof requestLeaveSchema>
): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = requestLeaveSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const { startDate, endDate, exceedsBalance, ticketNumber } = validated.data;
  if (new Date(endDate) < new Date(startDate)) {
    return { success: false, error: "End date must be after start date" };
  }

  // Server-side enforcement: ticket number is mandatory when exceeding balance
  if (exceedsBalance && !ticketNumber?.trim()) {
    return { success: false, error: "Ticket number is required when request exceeds available balance" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      org_id: ctx.orgId,
      employee_id: validated.data.employeeId,
      policy_id: validated.data.policyId,
      start_date: validated.data.startDate,
      end_date: validated.data.endDate,
      days: validated.data.days,
      reason: validated.data.reason || null,
      status: "pending",
      ticket_number: validated.data.ticketNumber?.trim() || null,
      exceeds_balance: validated.data.exceedsBalance ?? false,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function approveLeave(
  requestId: string,
  note?: string
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function rejectLeave(
  requestId: string,
  note?: string
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function cancelLeave(requestId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("status", "pending"); // can only cancel pending requests

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
