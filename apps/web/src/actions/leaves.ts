"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { render } from "@react-email/render";
import { computeLeaveDays } from "@jambahr/shared";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { resolveLeaveRecipients, type LeaveNotifiable } from "@/lib/leaves/request-recipients";
import { managerIdsOf, isManagerOfEmployee } from "@/lib/managers";
import { findOverlap, computeRemainingDays, type LeaveInterval } from "@/lib/leaves/validation";
import { loadLeaveAdjustmentUsage } from "@/lib/leaves/balance";
import {
  isCompOff,
  formatWorkedDate,
  validateCompOffRequest,
  describeWorkedDayAttendance,
  type WorkedDayAttendance,
} from "@/lib/leaves/comp-off";
import { canCancelLeave, monthsSpanned } from "@/lib/leaves/cancel-rules";
import { loadNonWorkingDates } from "@/lib/payroll/non-working-days";
import { istTodayDate } from "@/lib/attendance/manual-punch-validation";
import { LeaveRequestEmail } from "@/components/emails/leave-request";
import { LeaveStatusEmail } from "@/components/emails/leave-status";
import { LeaveCancelledEmail } from "@/components/emails/leave-cancelled";
import { notifyLeaveDecision, notifyApprovalPending } from "@/lib/mobile/notify";
import type { ActionResult, LeavePolicy, LeaveRequest } from "@/types";

// ---- Context helper ----

async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
  const { userId } = auth();
  const user = await getCurrentUser();
  if (!userId || !user) return null;
  return { orgId: user.orgId!, clerkUserId: userId };
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
  /** Comp-off only: what attendance shows for the worked day, for the approver. */
  comp_off_attendance: string | null;
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

  // Calculate used days per policy from the CALLER's own approved requests
  // this year. This feeds the personal balance cards — it must be scoped to
  // one employee, or everyone's displayed balance drops whenever anyone in
  // the org takes leave (bug reported 2026-07-17).
  const user = await getCurrentUser();
  const usedByPolicy: Record<string, number> = {};
  if (user?.employeeId) {
    const { data: approved } = await supabase
      .from("leave_requests")
      .select("policy_id, days")
      .eq("org_id", ctx.orgId)
      .eq("employee_id", user.employeeId)
      .eq("status", "approved")
      .gte("start_date", `${currentYear}-01-01`)
      .lte("end_date", `${currentYear}-12-31`);

    // + the leave ledger (e.g. late-arrival penalty deductions).
    const ledger = await loadLeaveAdjustmentUsage(supabase, {
      orgId: ctx.orgId,
      year: currentYear,
      employeeIds: [user.employeeId],
    });
    for (const req of [...(approved ?? []), ...ledger]) {
      usedByPolicy[req.policy_id] = (usedByPolicy[req.policy_id] ?? 0) + Number(req.days);
    }
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

  // Comp-off rows carry what attendance recorded on the day worked, so the
  // approver can check the claim without leaving the page.
  const compOff = ((data ?? []) as any[]).filter((r) => r.comp_off_worked_date);
  const attendanceByKey = new Map<string, WorkedDayAttendance>();
  if (compOff.length) {
    const { data: records } = await supabase
      .from("attendance_records")
      .select("employee_id, date, clock_in_at, clock_out_at, total_minutes, device_first_seen_at, device_last_seen_at")
      .eq("org_id", ctx.orgId)
      .in("employee_id", [...new Set(compOff.map((r) => r.employee_id))])
      .in("date", [...new Set(compOff.map((r) => r.comp_off_worked_date))]);
    for (const rec of (records ?? []) as any[]) attendanceByKey.set(`${rec.employee_id}|${rec.date}`, rec);
  }

  const requests = (data ?? []).map((r: any) => ({
    ...r,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    policy_name: r.leave_policies?.name ?? "Unknown",
    policy_type: r.leave_policies?.type ?? "custom",
    comp_off_attendance: r.comp_off_worked_date
      ? describeWorkedDayAttendance(attendanceByKey.get(`${r.employee_id}|${r.comp_off_worked_date}`))
      : null,
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

  // Aggregate used days per employee+policy (approved requests + leave ledger)
  const ledger = await loadLeaveAdjustmentUsage(supabase, { orgId: ctx.orgId, year: currentYear });
  const map: Record<string, EmployeeBalance> = {};
  for (const row of [...(data ?? []), ...ledger]) {
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
  startHalfDay: z.boolean().default(false),
  endHalfDay: z.boolean().default(false),
  /** Comp-off only: the week-off / holiday worked, which this request redeems. */
  compOffWorkedDate: z.string().optional(),
});

export async function requestLeave(
  formData: z.infer<typeof requestLeaveSchema>,
  // Mobile BFF passes the X-Org-Id header here so the write targets the caller's
  // ACTIVE org, not their first-membership fallback. Web callers omit it →
  // getCurrentUser({orgIdHint: undefined}) resolves via the cookie exactly as
  // before (byte-identical: current-user.ts uses `orgIdHint ?? cookie ?? null`).
  orgIdHint?: string | null
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser({ orgIdHint });
  if (!user) return { success: false, error: "Not authenticated" };
  const ctx = { orgId: user.orgId, clerkUserId: user.clerkUserId };

  const validated = requestLeaveSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const { startDate, endDate, exceedsBalance, ticketNumber, startHalfDay, endHalfDay } = validated.data;
  if (new Date(endDate) < new Date(startDate)) {
    return { success: false, error: "End date must be after start date" };
  }

  // Days resolution: the web dialog computes+sends `days` itself today, and
  // that path must stay byte-identical (no re-derivation, no drift risk).
  // The half-day chips are mobile-only for now — when either is set, derive
  // `days` server-side via the shared pure helper (mirrors the mobile
  // Request Leave sheet's own preview calc) so validation and the insert
  // both use a value consistent with the persisted flags.
  let days = validated.data.days;
  if (startHalfDay || endHalfDay) {
    const derived = computeLeaveDays(startDate, endDate, startHalfDay, endHalfDay);
    if (!derived.ok) {
      return { success: false, error: derived.error };
    }
    days = derived.days;
  }

  // Server-side enforcement: ticket number is mandatory when exceeding balance
  if (exceedsBalance && !ticketNumber?.trim()) {
    return { success: false, error: "Ticket number is required when request exceeds available balance" };
  }

  const supabase = createAdminSupabase();

  // Scope enforcement: the target employee must belong to this org, and the
  // caller may only request for themselves unless they are an admin, or a
  // manager-of-record of the target (either manager slot). `user` resolved above
  // (org-hint-aware).
  const { data: targetEmployee } = await supabase
    .from("employees")
    .select("id, department_id, reporting_manager_id, reporting_manager_2_id")
    .eq("id", validated.data.employeeId)
    .eq("org_id", ctx.orgId)
    .single();
  if (!targetEmployee) return { success: false, error: "Employee not found" };

  const isSelf = user.employeeId === targetEmployee.id;
  const isTheirManager =
    user.role === "manager" &&
    !!user.employeeId &&
    managerIdsOf(targetEmployee as { reporting_manager_id: string | null; reporting_manager_2_id: string | null }).includes(user.employeeId);
  if (!isAdmin(user.role) && !isSelf && !isTheirManager) {
    return { success: false, error: "You can only request leave for yourself or your direct reports" };
  }

  // ---- Server-side overlap + balance validation ----
  // These guard the direct-action path: a client that skips the in-form checks
  // (or a stale/hostile caller) must not be able to double-book a date range or
  // silently overdraw a leave balance. Admins are NOT exempt when filing for
  // others — data integrity is the whole point.
  const { data: policy } = await supabase
    .from("leave_policies")
    .select("type, days_per_year")
    .eq("id", validated.data.policyId)
    .eq("org_id", ctx.orgId)
    .single();
  if (!policy) return { success: false, error: "Leave type not found" };

  // Fetch the target's active (pending/approved) requests once — this serves
  // both the overlap check and the current-year used-days aggregation.
  const { data: activeRequests } = await supabase
    .from("leave_requests")
    .select("start_date, end_date, status, policy_id, days, comp_off_worked_date")
    .eq("org_id", ctx.orgId)
    .eq("employee_id", validated.data.employeeId)
    .in("status", ["pending", "approved"]);

  const existing = (activeRequests ?? []) as (LeaveInterval & {
    policy_id: string;
    days: number;
    comp_off_worked_date: string | null;
  })[];

  const conflict = findOverlap(existing, startDate, endDate);
  if (conflict) {
    return {
      success: false,
      error: `Overlaps an existing leave request (${conflict.start_date} to ${conflict.end_date})`,
    };
  }

  // Comp-off has no balance: each request redeems one worked week-off/holiday,
  // and the approval is the control.
  const compOff = isCompOff((policy as { type: string }).type);
  const workedDate = compOff ? validated.data.compOffWorkedDate ?? null : null;
  if (compOff) {
    let workedDayIsNonWorking: boolean | null = null;
    if (workedDate && /^\d{4}-\d{2}-\d{2}$/.test(workedDate)) {
      try {
        const nonWorking = await loadNonWorkingDates(supabase, {
          orgId: ctx.orgId,
          month: workedDate.slice(0, 7),
          employees: [{ id: targetEmployee.id, department_id: (targetEmployee as any).department_id ?? null }],
        });
        const mine = nonWorking.get(targetEmployee.id);
        // Holidays count even without a week-off policy; with no week-off at
        // any level an ordinary day can't be judged — the approver decides.
        workedDayIsNonWorking = mine?.dates.includes(workedDate) ? true : mine?.hasWeekOff ? false : null;
      } catch {
        // A failed read must not pass as "can't tell" (gotcha #102).
        return { success: false, error: "Couldn't check your week-offs and holidays — please try again" };
      }
    }
    const compOffError = validateCompOffRequest({
      startDate,
      endDate,
      days,
      workedDate,
      reason: validated.data.reason,
      todayIst: istTodayDate(),
      workedDayIsNonWorking,
    });
    if (compOffError) return { success: false, error: compOffError };
    if (existing.some((r) => r.comp_off_worked_date === workedDate)) {
      return { success: false, error: `You've already claimed a comp-off for ${formatWorkedDate(workedDate!)}` };
    }
  }

  // Balance check. Unpaid leave has no meaningful cap (LOP flows depend on it
  // staying requestable), and the sanctioned over-balance path — exceeds_balance
  // with a mandatory ticket number, enforced above — is honoured here too.
  const isUnpaid = (policy as { type: string }).type === "unpaid";
  if (!isUnpaid && !compOff && !exceedsBalance) {
    const currentYear = new Date().getFullYear();
    const usedApproved = existing
      .filter(
        (r) =>
          r.status === "approved" &&
          r.policy_id === validated.data.policyId &&
          r.start_date >= `${currentYear}-01-01` &&
          r.end_date <= `${currentYear}-12-31`
      )
      .reduce((sum, r) => sum + Number(r.days), 0) +
      (
        await loadLeaveAdjustmentUsage(supabase, {
          orgId: ctx.orgId,
          year: currentYear,
          employeeIds: [validated.data.employeeId],
        })
      )
        .filter((r) => r.policy_id === validated.data.policyId)
        .reduce((sum, r) => sum + r.days, 0);
    const remaining = computeRemainingDays({
      daysPerYear: (policy as { days_per_year: number }).days_per_year,
      usedApproved,
    });
    if (days > remaining) {
      return { success: false, error: `Insufficient balance — ${remaining} days remaining` };
    }
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      org_id: ctx.orgId,
      employee_id: validated.data.employeeId,
      policy_id: validated.data.policyId,
      start_date: validated.data.startDate,
      end_date: validated.data.endDate,
      days,
      reason: validated.data.reason || null,
      status: "pending",
      ticket_number: compOff ? null : validated.data.ticketNumber?.trim() || null,
      exceeds_balance: compOff ? false : validated.data.exceedsBalance ?? false,
      start_half_day: startHalfDay,
      end_half_day: endHalfDay,
      comp_off_worked_date: workedDate,
    })
    .select("id")
    .single();

  if (error) {
    // uq_leave_requests_comp_off_worked_date — a concurrent claim of the same day.
    if (compOff && error.code === "23505") {
      return { success: false, error: `You've already claimed a comp-off for ${formatWorkedDate(workedDate!)}` };
    }
    return { success: false, error: error.message };
  }

  // Fetch data needed for both the email and push notifications below. This
  // fetch is shared, but the email and push sends themselves run in their
  // OWN sibling try/catch blocks (not nested) — an email failure (e.g. Resend
  // throwing) must never suppress the push, and vice versa.
  let notifyEmployee: { first_name: string; last_name: string; reporting_manager_id: string | null; reporting_manager_2_id: string | null } | null = null;
  let notifyPolicy: { name: string } | null = null;
  let notifyManagers: LeaveNotifiable[] = [];
  const notifySupabase = createAdminSupabase();
  try {
    const [{ data: employee }, { data: policy }, { data: managers }] = await Promise.all([
      notifySupabase
        .from("employees")
        .select("first_name, last_name, reporting_manager_id, reporting_manager_2_id")
        .eq("id", validated.data.employeeId)
        .eq("org_id", ctx.orgId)
        .single(),
      notifySupabase
        .from("leave_policies")
        .select("name")
        .eq("id", validated.data.policyId)
        .single(),
      notifySupabase
        .from("employees")
        .select("id, role, email")
        .eq("org_id", ctx.orgId)
        .in("role", ["owner", "admin", "manager"])
        .eq("status", "active"),
    ]);
    notifyEmployee = employee as any;
    notifyPolicy = policy as any;
    notifyManagers = (managers ?? []) as LeaveNotifiable[];
  } catch {
    // Data fetch failure must not break the core action; email/push below
    // will just no-op since notifyEmployee/notifyPolicy/notifyManagers stay empty.
  }

  // Send email notification to managers/admins (non-blocking, independent of push)
  try {
    // Phase 1: filter out managers/admins with no email (phone-only staff). Phase 2 will route to WhatsApp.
    const managerEmails = resolveLeaveRecipients(
      managerIdsOf(notifyEmployee as any),
      notifyManagers
    );
    if (managerEmails.length > 0 && notifyEmployee && notifyPolicy) {
      const employeeName = `${notifyEmployee.first_name} ${notifyEmployee.last_name}`.trim();
      const html = await render(
        LeaveRequestEmail({
          employeeName,
          leaveType: notifyPolicy.name,
          startDate: validated.data.startDate,
          endDate: validated.data.endDate,
          days,
          reason: workedDate
            ? `Worked ${formatWorkedDate(workedDate)}. ${validated.data.reason ?? ""}`.trim()
            : validated.data.reason ?? "",
          approvalUrl: "https://jambahr.com/dashboard/leaves",
        })
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to: managerEmails,
        subject: `Leave Request: ${employeeName} — ${notifyPolicy.name}`,
        html,
      });
    }
  } catch {
    // Email failure must not break the core action
  }

  // Notify mobile approvers (best-effort, own try/catch — independent of the
  // email block above; must fire even if the email send throws). Reuses the
  // SAME recipient selection the email above uses (`resolveLeaveRecipients`'s
  // rule: managers-of-record + admins, falling back to every manager+ when
  // the employee has no manager set) — just projected to ids instead of
  // emails, since push doesn't need one.
  try {
    const managerIdsOfEmployee = managerIdsOf(notifyEmployee as any);
    const allManagerPlus = notifyManagers as { id: string; role: string }[];
    const admins = allManagerPlus.filter((p) => p.role === "owner" || p.role === "admin");
    const managersOfRecord = allManagerPlus.filter((p) => managerIdsOfEmployee.includes(p.id));
    const chosen =
      managerIdsOfEmployee.length > 0 ? [...managersOfRecord, ...admins] : allManagerPlus;
    const pushRecipientIds = [...new Set(chosen.map((p) => p.id))];

    if (pushRecipientIds.length > 0 && notifyEmployee) {
      const employeeName = `${notifyEmployee.first_name} ${notifyEmployee.last_name}`.trim();
      for (const recipientId of pushRecipientIds) {
        await notifyApprovalPending(notifySupabase, {
          orgId: ctx.orgId,
          employeeId: recipientId,
          approvalType: "leave",
          title: "New leave request",
          body: `${employeeName || "An employee"} requested leave`,
        });
      }
    }
  } catch {
    // Push failure must not break the core action
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function approveLeave(
  requestId: string,
  note?: string,
  orgIdHint?: string | null // mobile BFF passes X-Org-Id; web omits → cookie path (byte-identical)
): Promise<ActionResult<void>> {
  const user = await getCurrentUser({ orgIdHint });
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can approve leave" };
  const ctx = { orgId: user.orgId, clerkUserId: user.clerkUserId };

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
      reviewed_by: user.employeeId, // populate the decider so GET /leave's approverName join resolves (hi-fi 2b)
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

  // Notify mobile (best-effort, never blocks the core action)
  try {
    if (leaveReq) {
      const req = leaveReq as any;
      await notifyLeaveDecision(supabase, {
        orgId: ctx.orgId,
        employeeId: req.employee_id,
        approved: true,
      });
    }
  } catch {
    // Push/notification failure must not break the core action
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function rejectLeave(
  requestId: string,
  note?: string,
  orgIdHint?: string | null // mobile BFF passes X-Org-Id; web omits → cookie path (byte-identical)
): Promise<ActionResult<void>> {
  const user = await getCurrentUser({ orgIdHint });
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can reject leave" };
  const ctx = { orgId: user.orgId, clerkUserId: user.clerkUserId };

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
      reviewed_by: user.employeeId, // populate the decider so GET /leave's approverName join resolves (hi-fi 2b)
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

  // Notify mobile (best-effort, never blocks the core action)
  try {
    if (leaveReq) {
      const req = leaveReq as any;
      await notifyLeaveDecision(supabase, {
        orgId: ctx.orgId,
        employeeId: req.employee_id,
        approved: false,
      });
    }
  } catch {
    // Push/notification failure must not break the core action
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function cancelLeave(
  requestId: string,
  orgIdHint?: string | null // mobile BFF passes X-Org-Id; web omits → cookie path (byte-identical)
): Promise<ActionResult<void>> {
  const user = await getCurrentUser({ orgIdHint });
  if (!user) return { success: false, error: "Not authenticated" };
  const ctx = { orgId: user.orgId, clerkUserId: user.clerkUserId };

  const supabase = createAdminSupabase();

  // Separate reads (no embeds): request → owner → policy, all org-scoped.
  const { data: leaveReq } = await supabase
    .from("leave_requests")
    .select("id, employee_id, policy_id, status, start_date, end_date, days")
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!leaveReq) return { success: false, error: "Leave request not found" };
  const req = leaveReq as {
    employee_id: string;
    policy_id: string;
    status: string;
    start_date: string;
    end_date: string;
    days: number;
  };

  const [{ data: owner }, { data: policy }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, email, reporting_manager_id, reporting_manager_2_id")
      .eq("id", req.employee_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    supabase.from("leave_policies").select("name, type").eq("id", req.policy_id).eq("org_id", ctx.orgId).maybeSingle(),
  ]);
  const ownerRow = owner as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    reporting_manager_id: string | null;
    reporting_manager_2_id: string | null;
  } | null;
  const policyRow = policy as { name: string; type: string } | null;

  // Unpaid leave already turned into loss of pay once its month's payroll ran.
  let payrollLocked = false;
  if (req.status === "approved" && policyRow?.type === "unpaid") {
    const { data: runs, error: runsError } = await supabase
      .from("payroll_runs")
      .select("month, status")
      .eq("org_id", ctx.orgId)
      .in("month", monthsSpanned(req.start_date, req.end_date))
      .neq("status", "draft");
    // A failed read must not pass as "not locked" (gotcha #102).
    if (runsError) return { success: false, error: "Couldn't check payroll for this leave — please try again" };
    payrollLocked = (runs ?? []).length > 0;
  }

  const decision = canCancelLeave({
    status: req.status,
    startDate: req.start_date,
    todayIst: istTodayDate(),
    isOwn: !!user.employeeId && user.employeeId === req.employee_id,
    isManagerOfRecord: !!user.employeeId && !!ownerRow && isManagerOfEmployee(user.employeeId, ownerRow),
    isAdmin: isAdmin(user.role),
    payrollLocked,
  });
  if (!decision.ok) return { success: false, error: decision.error };

  // Conditional on the status we judged, so a request decided in the meantime
  // isn't cancelled under rules that no longer apply.
  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user.employeeId })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("status", req.status)
    .select("id");

  if (error) return { success: false, error: error.message };
  if (!updated || (updated as unknown[]).length === 0) {
    return { success: false, error: "This request just changed — refresh and try again" };
  }

  // Cancelling an approved leave changes someone's plans: tell the employee
  // (when someone else cancelled it) and their approvers. Best-effort.
  if (req.status === "approved" && ownerRow) {
    try {
      const employeeName = `${ownerRow.first_name ?? ""} ${ownerRow.last_name ?? ""}`.trim() || "An employee";
      let cancelledByName = employeeName;
      if (user.employeeId && user.employeeId !== ownerRow.id) {
        const { data: canceller } = await supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", user.employeeId)
          .eq("org_id", ctx.orgId)
          .maybeSingle();
        const c = canceller as { first_name: string | null; last_name: string | null } | null;
        cancelledByName = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "An admin";
      }
      const { data: managers } = await supabase
        .from("employees")
        .select("id, role, email")
        .eq("org_id", ctx.orgId)
        .in("role", ["owner", "admin", "manager"])
        .eq("status", "active");
      const approverEmails = resolveLeaveRecipients(
        managerIdsOf(ownerRow),
        ((managers ?? []) as LeaveNotifiable[]).filter((m) => m.id !== user.employeeId)
      );
      const details = {
        employeeName,
        leaveType: policyRow?.name ?? "Leave",
        startDate: req.start_date,
        endDate: req.end_date,
        days: Number(req.days),
        cancelledByName,
        dashboardUrl: "https://jambahr.com/dashboard/leaves",
      };
      const subject = `Leave cancelled: ${employeeName} — ${details.leaveType}`;
      if (approverEmails.length > 0) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: approverEmails,
          subject,
          html: await render(LeaveCancelledEmail({ ...details, toEmployee: false })),
        });
      }
      if (ownerRow.email && user.employeeId !== ownerRow.id) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: ownerRow.email,
          subject: "Your approved leave was cancelled",
          html: await render(LeaveCancelledEmail({ ...details, toEmployee: true })),
        });
      }
    } catch {
      // Email failure must not break the core action
    }
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
