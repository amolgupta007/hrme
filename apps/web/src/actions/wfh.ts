"use server";

// Work-from-home requests. NOT a leave type — a WFH day is a working day
// (clock-in and lateness apply as normal). Plan:
// docs/planning/2026-10-01-work-from-home-requests.md
import { revalidatePath } from "next/cache";
import { render } from "@react-email/render";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { managerIdsOf } from "@/lib/managers";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { WfhEmail } from "@/components/emails/wfh-request";
import {
  canDecideWfh,
  monthOf,
  normalizeWfhPolicy,
  normalizeWorkArrangement,
  planWfhRequest,
  reflagOverQuota,
  type WfhPolicy,
  type WorkArrangement,
} from "@jambahr/shared/attendance/wfh";
import type { ActionResult } from "@/types";

const WFH_URL = "https://jambahr.com/dashboard/leaves";

export type WfhRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  over_quota: boolean;
  reason: string | null;
  decision_note: string | null;
  decided_by_name: string | null;
  created_at: string;
};

export type MyWfh = {
  policy: WfhPolicy;
  arrangement: WorkArrangement;
  /** Pending + approved days in the current IST month. */
  usedThisMonth: number;
  requests: WfhRequestRow[];
};

const istToday = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

function datesLabel(dates: string[]): string {
  return [...dates]
    .sort()
    .map((d) =>
      new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      }),
    )
    .join(", ");
}

async function loadPolicy(supabase: ReturnType<typeof createAdminSupabase>, orgId: string) {
  const { data } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  return normalizeWfhPolicy((data as { settings?: unknown } | null)?.settings);
}

function toRow(r: any): WfhRequestRow {
  const emp = r.employees;
  const decider = r.decider;
  return {
    id: r.id,
    employee_id: r.employee_id,
    employee_name: emp ? `${emp.first_name} ${emp.last_name}`.trim() : "Unknown",
    date: r.date,
    status: r.status,
    over_quota: !!r.over_quota,
    reason: r.reason ?? null,
    decision_note: r.decision_note ?? null,
    decided_by_name: decider ? `${decider.first_name} ${decider.last_name}`.trim() : null,
    created_at: r.created_at,
  };
}

const ROW_SELECT =
  "id, employee_id, date, status, over_quota, reason, decision_note, created_at, employees!employee_id(first_name, last_name), decider:employees!decided_by(first_name, last_name)";

// ---- Employee: my WFH status + requests -------------------------------------
export async function getMyWfh(): Promise<ActionResult<MyWfh>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };
  const supabase = createAdminSupabase();

  const [policy, { data: emp }, { data: rows, error }] = await Promise.all([
    loadPolicy(supabase, user.orgId),
    supabase.from("employees").select("work_arrangement").eq("id", user.employeeId).maybeSingle(),
    supabase
      .from("wfh_requests")
      .select(ROW_SELECT)
      .eq("org_id", user.orgId)
      .eq("employee_id", user.employeeId)
      .gte("date", `${monthOf(istToday())}-01`)
      .order("date", { ascending: true }),
  ]);
  if (error) return { success: false, error: error.message };

  const requests = ((rows ?? []) as any[]).map(toRow);
  const month = monthOf(istToday());
  const usedThisMonth = requests.filter(
    (r) => monthOf(r.date) === month && (r.status === "pending" || r.status === "approved"),
  ).length;

  return {
    success: true,
    data: {
      policy,
      arrangement: normalizeWorkArrangement((emp as { work_arrangement?: string } | null)?.work_arrangement),
      usedThisMonth,
      requests,
    },
  };
}

// ---- Employee: request -----------------------------------------------------
const requestSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31),
  reason: z.string().trim().max(500).optional(),
});

export async function requestWfh(input: {
  dates: string[];
  reason?: string;
}): Promise<ActionResult<{ created: number; overQuota: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Pick at least one valid day" };

  const supabase = createAdminSupabase();
  const policy = await loadPolicy(supabase, user.orgId);
  if (!policy.enabled) return { success: false, error: "Work from home isn't enabled for your organisation" };

  const dates = parsed.data.dates;
  const minDate = [...dates].sort()[0];
  const maxDate = [...dates].sort().at(-1)!;
  const monthStart = `${monthOf(minDate)}-01`;
  const monthEnd = `${monthOf(maxDate)}-31`;

  const [{ data: emp }, { data: active }, { data: leaves }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, work_arrangement, reporting_manager_id, reporting_manager_2_id")
      .eq("id", user.employeeId)
      .eq("org_id", user.orgId)
      .maybeSingle(),
    supabase
      .from("wfh_requests")
      .select("date")
      .eq("employee_id", user.employeeId)
      .in("status", ["pending", "approved"])
      .gte("date", monthStart)
      .lte("date", monthEnd),
    supabase
      .from("leave_requests")
      .select("start_date, end_date")
      .eq("employee_id", user.employeeId)
      .in("status", ["pending", "approved"])
      .lte("start_date", maxDate)
      .gte("end_date", minDate),
  ]);
  if (!emp) return { success: false, error: "Employee not found" };

  const leaveDates = new Set<string>();
  for (const l of (leaves ?? []) as Array<{ start_date: string; end_date: string }>) {
    for (const d of dates) if (l.start_date <= d && d <= l.end_date) leaveDates.add(d);
  }

  const plan = planWfhRequest({
    dates,
    today: istToday(),
    arrangement: normalizeWorkArrangement((emp as any).work_arrangement),
    allowance: policy.monthlyAllowance,
    activeDates: new Set(((active ?? []) as Array<{ date: string }>).map((r) => r.date)),
    leaveDates,
  });
  if (!plan.ok) return { success: false, error: plan.error };

  const { error } = await supabase.from("wfh_requests").insert(
    plan.rows.map((r) => ({
      org_id: user.orgId,
      employee_id: user.employeeId!,
      date: r.date,
      over_quota: r.overQuota,
      reason: parsed.data.reason || null,
      created_by: user.employeeId,
    })),
  );
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { success: false, error: "You already have a request for one of those days" };
    }
    return { success: false, error: error.message };
  }

  const overQuota = plan.rows.filter((r) => r.overQuota).length;

  // Email approvers (best-effort): the reporting manager(s); admins too when a
  // day is beyond the allowance (only they can approve it) or no manager is set.
  try {
    const managerIds = managerIdsOf(emp as any);
    const { data: people } = await supabase
      .from("employees")
      .select("id, email, role")
      .eq("org_id", user.orgId)
      .neq("status", "terminated");
    const all = (people ?? []) as Array<{ id: string; email: string | null; role: string }>;
    const needAdmins = overQuota > 0 || managerIds.length === 0;
    const to = [
      ...new Set(
        all
          .filter((p) => managerIds.includes(p.id) || (needAdmins && (p.role === "owner" || p.role === "admin")))
          .map((p) => p.email)
          .filter((e): e is string => !!e),
      ),
    ];
    if (to.length > 0) {
      const employeeName = `${(emp as any).first_name} ${(emp as any).last_name}`.trim();
      const html = await render(
        WfhEmail({
          kind: "request",
          employeeName,
          datesLabel: datesLabel(plan.rows.map((r) => r.date)),
          reason: parsed.data.reason || null,
          overQuota: overQuota > 0,
          allowance: policy.monthlyAllowance,
          url: WFH_URL,
        }),
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: `Work-from-home request: ${employeeName}`,
        html,
      });
    }
  } catch {
    // Email failure must not break the request
  }

  revalidatePath("/dashboard/leaves");
  return { success: true, data: { created: plan.rows.length, overQuota } };
}

/**
 * A day was freed in these employee-months → re-mark which pending days are
 * beyond the allowance, so a freed slot lets the next request go back to the
 * reporting manager instead of waiting on an admin.
 */
async function reflagMonths(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  freed: Array<{ employee_id: string; date: string }>,
) {
  const policy = await loadPolicy(supabase, orgId);
  const keys = new Set(freed.map((f) => `${f.employee_id}|${monthOf(f.date)}`));
  for (const key of keys) {
    const [employeeId, month] = key.split("|");
    const { data } = await supabase
      .from("wfh_requests")
      .select("id, date, status, over_quota")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .gte("date", `${month}-01`)
      .lte("date", `${month}-31`);
    const changes = reflagOverQuota((data ?? []) as any[], policy.monthlyAllowance);
    for (const c of changes) {
      await supabase.from("wfh_requests").update({ over_quota: c.overQuota }).eq("id", c.id);
    }
  }
}

// ---- Employee: cancel (before the day) -----------------------------------
export async function cancelWfh(id: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();
  const { data: row } = await supabase
    .from("wfh_requests")
    .select("id, employee_id, date, status")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!row) return { success: false, error: "Request not found" };
  const r = row as { employee_id: string; date: string; status: string };
  if (r.employee_id !== user.employeeId && !isAdmin(user.role)) {
    return { success: false, error: "You can only cancel your own requests" };
  }
  if (r.status !== "pending" && r.status !== "approved") {
    return { success: false, error: "This request can't be cancelled" };
  }
  if (r.date < istToday() && !isAdmin(user.role)) {
    return { success: false, error: "Past days can't be cancelled" };
  }
  const { error } = await supabase.from("wfh_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await reflagMonths(supabase, user.orgId, [r]);
  revalidatePath("/dashboard/leaves");
  return { success: true, data: undefined };
}

// ---- Approvers -------------------------------------------------------------
export type WfhApprovals = {
  /** Pending requests this user may decide. */
  pending: WfhRequestRow[];
  /** Recently decided requests this user can see (last 30 days). */
  recent: WfhRequestRow[];
};

export async function listWfhApprovals(): Promise<ActionResult<WfhApprovals>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("wfh_requests")
    .select(`${ROW_SELECT}, mgr:employees!employee_id(reporting_manager_id, reporting_manager_2_id)`)
    .eq("org_id", user.orgId)
    .gte("date", since)
    .order("date", { ascending: true });
  if (error) return { success: false, error: error.message };

  const admin = isAdmin(user.role);
  const visible = ((data ?? []) as any[]).filter(
    (r) => admin || (user.employeeId && managerIdsOf(r.mgr ?? {}).includes(user.employeeId)),
  );
  const pending = visible
    .filter(
      (r) =>
        r.status === "pending" &&
        canDecideWfh({
          actorRole: user.role,
          actorEmployeeId: user.employeeId,
          employeeManagerIds: managerIdsOf(r.mgr ?? {}),
          overQuota: !!r.over_quota,
        }),
    )
    .map(toRow);
  const recent = visible.filter((r) => r.status !== "pending").map(toRow).reverse();
  return { success: true, data: { pending, recent } };
}

export async function decideWfh(input: {
  ids: string[];
  approve: boolean;
  note?: string;
}): Promise<ActionResult<{ decided: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (input.ids.length === 0) return { success: false, error: "Nothing selected" };
  if (!input.approve && !input.note?.trim()) {
    return { success: false, error: "Add a reason when not approving" };
  }
  const supabase = createAdminSupabase();

  const { data } = await supabase
    .from("wfh_requests")
    .select(
      "id, employee_id, date, status, over_quota, employees!employee_id(first_name, last_name, email, reporting_manager_id, reporting_manager_2_id)",
    )
    .eq("org_id", user.orgId)
    .in("id", input.ids);
  const rows = (data ?? []) as any[];
  if (rows.length !== input.ids.length) return { success: false, error: "Request not found" };

  for (const r of rows) {
    if (r.status !== "pending") return { success: false, error: "Only pending requests can be decided" };
    const allowed = canDecideWfh({
      actorRole: user.role,
      actorEmployeeId: user.employeeId,
      employeeManagerIds: managerIdsOf(r.employees ?? {}),
      overQuota: !!r.over_quota,
    });
    if (!allowed) {
      return {
        success: false,
        error: r.over_quota
          ? "This day is beyond the monthly allowance — only an admin can decide it"
          : "Only the employee's reporting manager or an admin can decide this",
      };
    }
  }

  const { error } = await supabase
    .from("wfh_requests")
    .update({
      status: input.approve ? "approved" : "rejected",
      decided_by: user.employeeId,
      decided_at: new Date().toISOString(),
      decision_note: input.note?.trim() || null,
    })
    .in("id", input.ids)
    .eq("org_id", user.orgId)
    .eq("status", "pending");
  if (error) return { success: false, error: error.message };
  if (!input.approve) await reflagMonths(supabase, user.orgId, rows);

  // One email per employee (best-effort).
  try {
    const byEmp = new Map<string, any[]>();
    for (const r of rows) byEmp.set(r.employee_id, [...(byEmp.get(r.employee_id) ?? []), r]);
    for (const list of byEmp.values()) {
      const e = list[0].employees;
      if (!e?.email) continue;
      const html = await render(
        WfhEmail({
          kind: "decision",
          employeeName: `${e.first_name} ${e.last_name}`.trim(),
          datesLabel: datesLabel(list.map((r) => r.date)),
          approved: input.approve,
          note: input.note?.trim() || null,
          url: WFH_URL,
        }),
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to: e.email,
        subject: input.approve ? "Work from home approved" : "Work from home not approved",
        html,
      });
    }
  } catch {
    // Email failure must not break the decision
  }

  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard/attendance");
  return { success: true, data: { decided: rows.length } };
}

// ---- Admin: policy ---------------------------------------------------------
export async function getWfhPolicy(): Promise<ActionResult<WfhPolicy>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  return { success: true, data: await loadPolicy(createAdminSupabase(), user.orgId) };
}

export async function updateWfhPolicy(input: {
  enabled: boolean;
  monthlyAllowance: number;
}): Promise<ActionResult<WfhPolicy>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can change this" };
  const n = Math.floor(Number(input.monthlyAllowance));
  if (!Number.isFinite(n) || n < 0 || n > 31) {
    return { success: false, error: "Monthly allowance must be between 0 and 31" };
  }

  const supabase = createAdminSupabase();
  const { data: org } = await supabase.from("organizations").select("settings").eq("id", user.orgId).single();
  const settings = ((org as { settings?: any } | null)?.settings ?? {}) as any;
  const next = {
    ...settings,
    attendance: {
      ...(settings.attendance ?? {}),
      wfh: { ...(settings.attendance?.wfh ?? {}), enabled: !!input.enabled, monthly_allowance: n },
    },
  };
  const { error } = await supabase.from("organizations").update({ settings: next }).eq("id", user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/leaves");
  return { success: true, data: normalizeWfhPolicy(next) };
}
