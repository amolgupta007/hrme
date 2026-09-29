"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { validateBands, type PenaltyBand } from "@/lib/attendance/late-penalty-bands";
import type { ActionResult } from "@/types";
import { monthBounds } from "@jambahr/shared/attendance/late-eligibility";
import { loadCountableLates } from "@/lib/attendance/late-counting";
import { evaluateLateMonth, loadCoveredEmployeeIds, loadEnabledLatePolicy } from "@/lib/attendance/late-evaluation";
import { refreshPayrollLatePenalty, reverseLadderEvent, sendLadderNotice } from "@/lib/attendance/late-ladder-apply";

export type LateConsequence = "block_bonus" | "salary_deduction" | "both" | "none" | "leave_deduction";

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
  consequence: LateConsequence;
  /** Go-live date: late arrivals before it never count. Set when the policy is switched on. */
  evaluate_from: string | null;
  // Warning + leave-deduction ladder (consequence 'leave_deduction')
  ladder_warning_at: number | null;
  ladder_deduct_at: number;
  ladder_leave_type: "casual" | "paid" | "sick" | "custom";
  ladder_deduct_days: number;
  ladder_repeat: boolean;
  ladder_lop_fallback: boolean;
  ladder_cc_managers: boolean;
  ladder_cc_admins: boolean;
  ladder_dispute_days: number;
};

export type LatePolicyTargetRow = { target_type: "department" | "employee"; target_id: string };

const BandSchema = z.object({
  min_late_days: z.number().int().min(1).max(31),
  max_late_days: z.number().int().min(1).max(31).nullable(),
  deduction_days: z.number().min(0).max(31),
});

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
  consequence: z.enum(["block_bonus", "salary_deduction", "both", "none", "leave_deduction"]),
  ladder_warning_at: z.number().int().min(1).max(31).nullable().default(3),
  ladder_deduct_at: z.number().int().min(1).max(31).default(5),
  ladder_leave_type: z.enum(["casual", "paid", "sick", "custom"]).default("casual"),
  ladder_deduct_days: z
    .number()
    .min(0.5)
    .max(5)
    .refine((n) => Number.isInteger(n * 2), "Deduction must be in half-day steps")
    .default(1),
  ladder_repeat: z.boolean().default(true),
  ladder_lop_fallback: z.boolean().default(true),
  ladder_cc_managers: z.boolean().default(true),
  ladder_cc_admins: z.boolean().default(false),
  ladder_dispute_days: z.number().int().min(0).max(30).default(2),
  targets: z.array(z.object({ target_type: z.enum(["department", "employee"]), target_id: z.string().uuid() })),
  bands: z.array(BandSchema),
});

export async function getLatePolicy(): Promise<
  ActionResult<{ policy: LatePolicy | null; targets: LatePolicyTargetRow[]; bands: PenaltyBand[] }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data: policy } = await sb.from("late_policies").select("*").eq("org_id", user.orgId).maybeSingle();
  if (!policy) return { success: true, data: { policy: null, targets: [], bands: [] } };
  const { data: targets } = await sb
    .from("late_policy_targets")
    .select("target_type, target_id")
    .eq("policy_id", (policy as any).id);
  const { data: bandRows } = await sb
    .from("late_penalty_bands")
    .select("min_late_days, max_late_days, deduction_days")
    .eq("policy_id", (policy as any).id)
    .order("sort", { ascending: true });
  const bands: PenaltyBand[] = ((bandRows ?? []) as any[]).map((b) => ({
    min_late_days: b.min_late_days,
    max_late_days: b.max_late_days,
    deduction_days: Number(b.deduction_days),
  }));
  return { success: true, data: { policy: policy as any, targets: (targets ?? []) as any, bands } };
}

export async function upsertLatePolicy(input: z.input<typeof PolicySchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit the late policy" };
  const parsed = PolicySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  if (parsed.data.warn_at != null && parsed.data.warn_at >= parsed.data.threshold_days) {
    return { success: false, error: "Warn-at must be below the threshold" };
  }
  if (
    parsed.data.consequence === "leave_deduction" &&
    parsed.data.ladder_warning_at != null &&
    parsed.data.ladder_warning_at >= parsed.data.ladder_deduct_at
  ) {
    return { success: false, error: "The warning must come before the deduction" };
  }
  const { targets, bands, ...policyFields } = parsed.data;

  // Validate bands only when the consequence actually deducts salary.
  const deducts = policyFields.consequence === "salary_deduction" || policyFields.consequence === "both";
  if (deducts) {
    const v = validateBands(bands as PenaltyBand[]);
    if (!v.ok) return { success: false, error: v.error };
  }

  const sb = createAdminSupabase();
  const { data: existing } = await sb
    .from("late_policies")
    .select("id, enabled, evaluate_from")
    .eq("org_id", user.orgId)
    .maybeSingle();
  // Switching a policy ON (or creating it enabled) stamps its go-live date:
  // late arrivals before today never count, so enabling never back-dates penalties.
  const todayIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const turningOn = policyFields.enabled && (!existing || !(existing as any).enabled);
  const evaluateFrom = turningOn ? todayIst : ((existing as any)?.evaluate_from ?? (policyFields.enabled ? todayIst : null));
  let policyId: string;
  if (existing) {
    policyId = (existing as any).id;
    const { error } = await sb
      .from("late_policies")
      .update({ ...policyFields, evaluate_from: evaluateFrom, updated_at: new Date().toISOString() } as any)
      .eq("id", policyId);
    if (error) return { success: false, error: error.message };
  } else {
    const { data, error } = await sb
      .from("late_policies")
      .insert({ org_id: user.orgId, ...policyFields, evaluate_from: evaluateFrom } as any)
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

  // Bands are append-and-replace per policy. Only persisted when the consequence deducts.
  await sb.from("late_penalty_bands").delete().eq("policy_id", policyId);
  if (deducts && bands.length > 0) {
    const bandRows = bands.map((b, i) => ({
      org_id: user.orgId,
      policy_id: policyId,
      min_late_days: b.min_late_days,
      max_late_days: b.max_late_days,
      deduction_days: b.deduction_days,
      sort: i,
    }));
    const { error: bErr } = await sb.from("late_penalty_bands").insert(bandRows as any);
    if (bErr) return { success: false, error: bErr.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/attendance");
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
  if (!/^\d{4}-\d{2}$/.test(input.month)) return { success: false, error: "Invalid month" };
  const sb = createAdminSupabase();

  // The employee must belong to the caller's org.
  const { data: emp } = await sb
    .from("employees").select("id").eq("id", input.employeeId).eq("org_id", user.orgId).maybeSingle();
  if (!emp) return { success: false, error: "Employee not found" };
  const { data: policy } = await sb.from("late_policies").select("id").eq("org_id", user.orgId).maybeSingle();
  if (!policy) return { success: false, error: "No late policy configured" };

  // Upsert, not update: a salary band can start BELOW threshold_days, in which
  // case no flag row exists yet — the old update silently changed 0 rows and
  // reported success while the penalty stayed in payroll.
  const now = new Date().toISOString();
  const waiver = {
    status: "overridden",
    override_by: user.employeeId ?? null,
    override_reason: input.reason.trim(),
    overridden_at: now,
    updated_at: now,
  };
  const { data: existing } = await sb
    .from("late_policy_flags")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("employee_id", input.employeeId)
    .eq("month", input.month)
    .maybeSingle();
  const { error } = existing
    ? await sb.from("late_policy_flags").update(waiver as any).eq("id", (existing as any).id)
    : await sb.from("late_policy_flags").insert({
        org_id: user.orgId,
        policy_id: (policy as any).id,
        employee_id: input.employeeId,
        month: input.month,
        late_days_count: 0,
        ...waiver,
      } as any);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

// ── Late arrivals: per-day excuse, penalties view, waiver, employee status ──

const LEAVE_LABELS = { casual: "casual leave", paid: "earned leave", sick: "sick leave", custom: "leave" } as const;
const leaveLabelFor = (type: string) => LEAVE_LABELS[type as keyof typeof LEAVE_LABELS] ?? "leave";

type AdminUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function requireAdmin(): Promise<{ ok: false; error: string } | { ok: true; user: AdminUser }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { ok: false, error: "Unauthorized" };
  return { ok: true, user };
}

/**
 * Excuse (or un-excuse) one late day. An excused day no longer counts toward
 * the monthly total, so the month is re-evaluated at once — which can lift a
 * flag or reverse a ladder deduction.
 */
export async function excuseLateDay(input: {
  recordId: string;
  excused: boolean;
  reason?: string;
}): Promise<ActionResult<{ lateCount: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { user } = auth;
  const reason = (input.reason ?? "").trim();
  if (input.excused && !reason) return { success: false, error: "A reason is required" };

  const sb = createAdminSupabase();
  const { data: rec } = await sb
    .from("attendance_records")
    .select("id, employee_id, date")
    .eq("id", input.recordId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!rec) return { success: false, error: "Attendance record not found" };

  const { error } = await sb
    .from("attendance_records")
    .update({
      late_excused: input.excused,
      late_excused_by: input.excused ? (user.employeeId ?? null) : null,
      late_excused_at: input.excused ? new Date().toISOString() : null,
      late_excuse_reason: input.excused ? reason : null,
    })
    .eq("id", input.recordId)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  const policy = await loadEnabledLatePolicy(sb, user.orgId);
  let lateCount = 0;
  if (policy) {
    const r = await evaluateLateMonth(sb, policy, (rec as any).employee_id, String((rec as any).date).slice(0, 7));
    lateCount = r.count;
  }
  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/payroll");
  return { success: true, data: { lateCount } };
}

export type LatePenaltyDay = {
  recordId: string;
  date: string;
  clockInAt: string | null;
  lateMinutes: number | null;
  excused: boolean;
  excuseReason: string | null;
  /** Counts toward the monthly total (false: excused, week-off, holiday, leave, or before go-live). */
  counted: boolean;
};

export type LatePenaltyEventView = {
  id: string;
  kind: "warning" | "deduction";
  occurrenceNo: number;
  lateCount: number;
  clDays: number;
  lopDays: number;
  status: "applied" | "reversed" | "waived" | "needs_review";
  statusReason: string | null;
  emailStatus: string | null;
  createdAt: string;
};

export type LatePenaltyRow = {
  employeeId: string;
  name: string;
  department: string | null;
  lateCount: number;
  days: LatePenaltyDay[];
  events: LatePenaltyEventView[];
};

export async function listLatePenalties(
  month: string
): Promise<ActionResult<{ policy: LatePolicy | null; rows: LatePenaltyRow[] }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { user } = auth;
  if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, error: "Invalid month" };

  const sb = createAdminSupabase();
  const { data: policyRow } = await sb.from("late_policies").select("*").eq("org_id", user.orgId).maybeSingle();
  if (!policyRow) return { success: true, data: { policy: null, rows: [] } };
  const policy = policyRow as any;
  const { start, end } = monthBounds(month);

  const [{ data: lateRecords }, { data: events }, { data: emps }] = await Promise.all([
    sb
      .from("attendance_records")
      .select("id, employee_id, date, clock_in_at, late_minutes, late_excused, late_excuse_reason")
      .eq("org_id", user.orgId)
      .eq("is_late", true)
      .gte("date", start)
      .lte("date", end)
      .order("date"),
    sb.from("late_penalty_events").select("*").eq("org_id", user.orgId).eq("month", month).order("created_at"),
    sb.from("employees").select("id, first_name, last_name, departments!department_id(name)").eq("org_id", user.orgId),
  ]);

  const employeeIds = [
    ...new Set([
      ...((lateRecords ?? []) as any[]).map((r) => r.employee_id as string),
      ...((events ?? []) as any[]).map((e) => e.employee_id as string),
    ]),
  ];
  const countable = await loadCountableLates(sb, {
    orgId: user.orgId,
    month,
    employeeIds,
    evaluateFrom: policy.evaluate_from ?? null,
  });
  const empById = new Map(((emps ?? []) as any[]).map((e) => [e.id, e]));

  const rows: LatePenaltyRow[] = employeeIds
    .map((employeeId) => {
      const e = empById.get(employeeId);
      const counted = new Set((countable.get(employeeId) ?? []).map((d) => d.id));
      return {
        employeeId,
        name: e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : "Former employee",
        department: e?.departments?.name ?? null,
        lateCount: counted.size,
        days: ((lateRecords ?? []) as any[])
          .filter((r) => r.employee_id === employeeId)
          .map((r) => ({
            recordId: r.id,
            date: r.date,
            clockInAt: r.clock_in_at,
            lateMinutes: r.late_minutes,
            excused: !!r.late_excused,
            excuseReason: r.late_excuse_reason ?? null,
            counted: counted.has(r.id),
          })),
        events: ((events ?? []) as any[])
          .filter((ev) => ev.employee_id === employeeId)
          .map((ev) => ({
            id: ev.id,
            kind: ev.kind,
            occurrenceNo: ev.occurrence_no,
            lateCount: ev.late_count,
            clDays: Number(ev.cl_days),
            lopDays: Number(ev.lop_days),
            status: ev.status,
            statusReason: ev.status_reason ?? null,
            emailStatus: ev.email_status ?? null,
            createdAt: ev.created_at,
          })),
      };
    })
    .sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name));

  return { success: true, data: { policy: policy as LatePolicy, rows } };
}

/** Admin waiver of one ladder deduction: credit the leave back, drop the LOP, notify. */
export async function waiveLatePenalty(input: { eventId: string; reason: string }): Promise<ActionResult<void>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const { user } = auth;
  const reason = input.reason.trim();
  if (!reason) return { success: false, error: "A reason is required" };

  const sb = createAdminSupabase();
  const { data: ev } = await sb
    .from("late_penalty_events")
    .select("*")
    .eq("id", input.eventId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!ev || (ev as any).kind !== "deduction") return { success: false, error: "Penalty not found" };
  const e = ev as any;

  const ok = await reverseLadderEvent(
    sb,
    { ...e, cl_days: Number(e.cl_days) },
    { status: "waived", reason, by: user.employeeId ?? null }
  );
  if (!ok) return { success: false, error: "This penalty has already been reversed or waived" };
  await refreshPayrollLatePenalty(sb, user.orgId, e.employee_id, e.month);

  const policy = await loadEnabledLatePolicy(sb, user.orgId);
  if (policy) {
    const leaveLabel = leaveLabelFor(policy.ladder_leave_type);
    await sendLadderNotice(sb, {
      policy,
      employeeId: e.employee_id,
      eventId: e.id,
      variant: "correction",
      month: e.month,
      lateCount: e.late_count,
      lates: [],
      leaveLabel,
      correctionSummary: [
        "Your attendance penalty has been waived.",
        Number(e.cl_days) > 0 ? `${Number(e.cl_days)} ${leaveLabel} has been credited back.` : "",
        Number(e.lop_days) > 0 ? `The ${Number(e.lop_days)}-day loss of pay has been removed.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

export type MyLateStatus = {
  month: string;
  lateCount: number;
  mode: "ladder" | "threshold";
  warningAt: number | null;
  deductAt: number | null;
  deductDays: number | null;
  leaveLabel: string | null;
  thresholdDays: number | null;
};

/** The caller's own late count this month, for the attendance banner. Null when no policy covers them. */
export async function getMyLateStatus(): Promise<MyLateStatus | null> {
  const user = await getCurrentUser();
  if (!user?.employeeId) return null;
  const sb = createAdminSupabase();
  const policy = await loadEnabledLatePolicy(sb, user.orgId);
  if (!policy || policy.consequence === "none") return null;
  const covered = await loadCoveredEmployeeIds(sb, policy);
  if (!covered.has(user.employeeId)) return null;
  const month = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
  const lates =
    (
      await loadCountableLates(sb, {
        orgId: user.orgId,
        month,
        employeeIds: [user.employeeId],
        evaluateFrom: policy.evaluate_from,
      })
    ).get(user.employeeId) ?? [];
  const ladder = policy.consequence === "leave_deduction";
  return {
    month,
    lateCount: lates.length,
    mode: ladder ? "ladder" : "threshold",
    warningAt: ladder ? policy.ladder_warning_at : null,
    deductAt: ladder ? policy.ladder_deduct_at : null,
    deductDays: ladder ? Number(policy.ladder_deduct_days) : null,
    leaveLabel: ladder ? leaveLabelFor(policy.ladder_leave_type) : null,
    thresholdDays: ladder ? null : policy.threshold_days,
  };
}
