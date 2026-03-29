"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/current-user";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { LeaveRequestEmail } from "@/components/emails/leave-request";
import { LeaveStatusEmail } from "@/components/emails/leave-status";
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

  // Send email notification to managers/admins (non-blocking)
  try {
    const supabase = createAdminSupabase();
    const [{ data: employee }, { data: policy }, { data: managers }] = await Promise.all([
      supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", validated.data.employeeId)
        .single(),
      supabase
        .from("leave_policies")
        .select("name")
        .eq("id", validated.data.policyId)
        .single(),
      supabase
        .from("employees")
        .select("email")
        .eq("org_id", ctx.orgId)
        .in("role", ["owner", "admin", "manager"])
        .eq("status", "active"),
    ]);

    const managerEmails = (managers ?? []).map((m: { email: string }) => m.email).filter(Boolean);
    if (managerEmails.length > 0 && employee && policy) {
      const employeeName = `${(employee as any).first_name} ${(employee as any).last_name}`.trim();
      const html = await render(
        LeaveRequestEmail({
          employeeName,
          leaveType: (policy as any).name,
          startDate: validated.data.startDate,
          endDate: validated.data.endDate,
          days: validated.data.days,
          reason: validated.data.reason ?? "",
          approvalUrl: "https://jambahr.com/dashboard/leaves",
        })
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to: managerEmails,
        subject: `Leave Request: ${employeeName} — ${(policy as any).name}`,
        html,
      });
    }
  } catch {
    // Email failure must not break the core action
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function approveLeave(
  requestId: string,
  note?: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can approve leave" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Fetch request details before updating (for email)
  const { data: leaveReq } = await supabase
    .from("leave_requests")
    .select("employee_id, policy_id, start_date, end_date, days, employees!employee_id(first_name, last_name, email), leave_policies(name)")
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .single();

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

  // Notify employee (non-blocking)
  try {
    if (leaveReq) {
      const req = leaveReq as any;
      const employeeEmail = req.employees?.email;
      const employeeName = `${req.employees?.first_name ?? ""} ${req.employees?.last_name ?? ""}`.trim();
      if (employeeEmail) {
        const html = await render(
          LeaveStatusEmail({
            employeeName,
            leaveType: req.leave_policies?.name ?? "Leave",
            startDate: req.start_date,
            endDate: req.end_date,
            days: Number(req.days),
            status: "approved",
            note: note || undefined,
            dashboardUrl: "https://jambahr.com/dashboard/leaves",
          })
        );
        await resend.emails.send({
          from: FROM_EMAIL,
          to: employeeEmail,
          subject: "Your leave request has been approved",
          html,
        });
      }
    }
  } catch {
    // Email failure must not break the core action
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function rejectLeave(
  requestId: string,
  note?: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can reject leave" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Fetch request details before updating (for email)
  const { data: leaveReq } = await supabase
    .from("leave_requests")
    .select("employee_id, policy_id, start_date, end_date, days, employees!employee_id(first_name, last_name, email), leave_policies(name)")
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .single();

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

  // Notify employee (non-blocking)
  try {
    if (leaveReq) {
      const req = leaveReq as any;
      const employeeEmail = req.employees?.email;
      const employeeName = `${req.employees?.first_name ?? ""} ${req.employees?.last_name ?? ""}`.trim();
      if (employeeEmail) {
        const html = await render(
          LeaveStatusEmail({
            employeeName,
            leaveType: req.leave_policies?.name ?? "Leave",
            startDate: req.start_date,
            endDate: req.end_date,
            days: Number(req.days),
            status: "rejected",
            note: note || undefined,
            dashboardUrl: "https://jambahr.com/dashboard/leaves",
          })
        );
        await resend.emails.send({
          from: FROM_EMAIL,
          to: employeeEmail,
          subject: "Your leave request has been rejected",
          html,
        });
      }
    }
  } catch {
    // Email failure must not break the core action
  }

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
