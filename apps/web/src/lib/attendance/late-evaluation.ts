// Plain module — NOT "use server" (gotcha #85): raw org ids, employee PII, emails.
//
// Lateness used to be computed only on the web clock-in, so biometric and
// mobile punches were never marked late and every late rule was inert for
// them. It now runs from recomputeAttendanceDay — the single path every punch
// source (web, mobile, ADMS, manual, approve/reject/void) goes through — so a
// correction re-evaluates the day too.
//
//   evaluateDayLateness  → sets attendance_records.is_late/late_minutes for one day
//   evaluateLateMonth    → recounts the month (countable lates only) and drives
//                          the consequences: monthly flags + existing alerts,
//                          or the warning/deduction ladder.

import { computeLateness } from "@jambahr/shared/attendance/lateness";
import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";
import { resolveAssignmentForDate } from "@/lib/attendance/schedule-resolve";
import { planNotificationKinds } from "@/lib/attendance/late-policy-notify";
import { dispatchLateNotifications } from "@/lib/attendance/late-policy-dispatch";
import { loadCountableLates } from "@/lib/attendance/late-counting";
import { applyLateLadder } from "@/lib/attendance/late-ladder-apply";

type Supabase = { from: (table: string) => any };

export type LatePolicyRow = {
  id: string;
  org_id: string;
  enabled: boolean;
  threshold_days: number;
  warn_at: number | null;
  fallback_cutoff_time: string | null;
  notify_on_late: boolean;
  notify_on_threshold: boolean;
  channel_email: boolean;
  channel_whatsapp: boolean;
  consequence: "block_bonus" | "salary_deduction" | "both" | "none" | "leave_deduction";
  evaluate_from: string | null;
  ladder_warning_at: number | null;
  ladder_deduct_at: number;
  ladder_leave_type: string;
  ladder_deduct_days: number | string;
  ladder_repeat: boolean;
  ladder_lop_fallback: boolean;
  ladder_cc_managers: boolean;
  ladder_cc_admins: boolean;
  ladder_dispute_days: number;
};

export async function loadEnabledLatePolicy(supabase: Supabase, orgId: string): Promise<LatePolicyRow | null> {
  const { data } = await supabase.from("late_policies").select("*").eq("org_id", orgId).eq("enabled", true).maybeSingle();
  return (data as LatePolicyRow) ?? null;
}

export async function loadCoveredEmployeeIds(supabase: Supabase, policy: LatePolicyRow): Promise<Set<string>> {
  const [{ data: targets }, { data: emps }] = await Promise.all([
    supabase.from("late_policy_targets").select("target_type, target_id").eq("policy_id", policy.id),
    supabase.from("employees").select("id, department_id").eq("org_id", policy.org_id).neq("status", "terminated"),
  ]);
  return resolveCoveredEmployeeIds({ targets: (targets ?? []) as any, employees: (emps ?? []) as any });
}

/** The shift that governs `date` for this employee (latest assignment covering it). */
async function resolveShift(supabase: Supabase, orgId: string, employeeId: string, date: string) {
  const { data } = await supabase
    .from("shift_assignments")
    .select("date_from, date_to, shifts(start_time, grace_minutes, is_overnight)")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .lte("date_from", date)
    .order("date_from", { ascending: false })
    .limit(5);
  const row = resolveAssignmentForDate((data ?? []) as any[], date) as any;
  const s = row?.shifts;
  return s ? { start_time: s.start_time, grace_minutes: s.grace_minutes ?? 0, is_overnight: !!s.is_overnight } : null;
}

/**
 * Decide is_late for one (employee, IST day) from its rollup, then re-run the
 * month. Best-effort by contract: callers swallow errors so a lateness
 * failure can never break punch ingestion.
 */
export async function evaluateDayLateness(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  istDate: string,
  opts: {
    policy?: LatePolicyRow | null;
    covered?: Set<string>;
    skipMonth?: boolean;
    /** Hand the month step (flags, ladder, emails) to e.g. waitUntil instead of awaiting it. */
    defer?: (p: Promise<unknown>) => void;
  } = {}
): Promise<void> {
  const policy = opts.policy !== undefined ? opts.policy : await loadEnabledLatePolicy(supabase, orgId);
  if (!policy) return;
  // Go-live guard: earlier days are never (re)evaluated — no retroactive penalties.
  if (policy.evaluate_from && istDate < policy.evaluate_from) return;

  const { data: record } = await supabase
    .from("attendance_records")
    .select("id, clock_in_at, is_late, late_minutes")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .eq("date", istDate)
    .maybeSingle();
  if (!record) return;
  const rec = record as { id: string; clock_in_at: string | null; is_late: boolean; late_minutes: number | null };

  const covered = opts.covered ?? (await loadCoveredEmployeeIds(supabase, policy));
  let isLate = false;
  let lateMinutes: number | null = null;
  if (covered.has(employeeId) && rec.clock_in_at) {
    const shift = await resolveShift(supabase, orgId, employeeId, istDate);
    const r = computeLateness({ clockInAtUtc: rec.clock_in_at, shift, fallbackCutoff: policy.fallback_cutoff_time });
    if (r.evaluated) {
      isLate = r.isLate;
      lateMinutes = r.isLate ? r.lateMinutes : null;
    }
  }

  const changed = rec.is_late !== isLate || (rec.late_minutes ?? null) !== lateMinutes;
  if (changed) {
    await supabase
      .from("attendance_records")
      .update({ is_late: isLate, late_minutes: lateMinutes, late_policy_id: isLate ? policy.id : null })
      .eq("id", rec.id);
  }

  if (opts.skipMonth) return;
  // Re-run the month whenever the day's lateness moved (on → alert/ladder;
  // off → counts drop, flags/ladder steps may reverse).
  if (changed) {
    const month = evaluateLateMonth(supabase, policy, employeeId, istDate.slice(0, 7), {
      newlyLateRecordId: isLate && !rec.is_late ? rec.id : null,
      covered,
    });
    if (opts.defer) opts.defer(month.catch((e) => console.error("[late] month evaluation failed:", e)));
    else await month;
  }
}

/**
 * Recount one employee's month and apply consequences. Idempotent: flags are
 * upserted, alerts are claim-then-send per (record, kind, channel), and ladder
 * steps are keyed (employee, month, kind, occurrence).
 */
export async function evaluateLateMonth(
  supabase: Supabase,
  policy: LatePolicyRow,
  employeeId: string,
  month: string,
  opts: { newlyLateRecordId?: string | null; covered?: Set<string> } = {}
): Promise<{ count: number }> {
  const covered = opts.covered ?? (await loadCoveredEmployeeIds(supabase, policy));
  const lates = covered.has(employeeId)
    ? ((
        await loadCountableLates(supabase, {
          orgId: policy.org_id,
          month,
          employeeIds: [employeeId],
          evaluateFrom: policy.evaluate_from,
        })
      ).get(employeeId) ?? [])
    : [];
  const count = lates.length;

  if (policy.consequence === "leave_deduction") {
    await applyLateLadder(supabase, { policy, employeeId, month, lates });
  } else {
    await syncMonthlyFlag(supabase, policy, employeeId, month, count);
  }

  // Per-late alerts (and, outside ladder mode, the warn/threshold alerts).
  const newly = opts.newlyLateRecordId ? lates.find((l) => l.id === opts.newlyLateRecordId) : null;
  if (newly) {
    let kinds = planNotificationKinds({
      policy: {
        threshold_days: policy.threshold_days,
        warn_at: policy.warn_at,
        notify_on_late: policy.notify_on_late,
        notify_on_threshold: policy.notify_on_threshold,
      },
      isLate: true,
      prevCount: count - 1,
      newCount: count,
    });
    // Ladder mode sends its own warning/deduction emails; keep only the per-late ping.
    if (policy.consequence === "leave_deduction") kinds = kinds.filter((k) => k === "late");
    if (kinds.length) await sendLateAlerts(supabase, policy, employeeId, newly, count, month, kinds);
  }
  return { count };
}

/** The monthly flag (bonus block / salary-band waiver) tracks the countable total. */
async function syncMonthlyFlag(
  supabase: Supabase,
  policy: LatePolicyRow,
  employeeId: string,
  month: string,
  count: number
): Promise<void> {
  const { data: flag } = await supabase
    .from("late_policy_flags")
    .select("id, status")
    .eq("org_id", policy.org_id)
    .eq("employee_id", employeeId)
    .eq("month", month)
    .maybeSingle();
  const f = flag as { id: string; status: string } | null;
  if (f?.status === "overridden") return; // an admin's waiver always stands

  if (count >= policy.threshold_days) {
    if (f) {
      await supabase
        .from("late_policy_flags")
        .update({ late_days_count: count, updated_at: new Date().toISOString() })
        .eq("id", f.id);
    } else {
      await supabase.from("late_policy_flags").insert({
        org_id: policy.org_id,
        policy_id: policy.id,
        employee_id: employeeId,
        month,
        late_days_count: count,
        status: "flagged",
      });
    }
  } else if (f) {
    // A correction/excuse took them back under the threshold: lift the flag.
    await supabase.from("late_policy_flags").delete().eq("id", f.id);
  }
}

async function sendLateAlerts(
  supabase: Supabase,
  policy: LatePolicyRow,
  employeeId: string,
  late: { id: string; clock_in_at: string | null; late_minutes: number | null },
  count: number,
  month: string,
  kinds: ReturnType<typeof planNotificationKinds>
): Promise<void> {
  const [{ data: emp }, { data: org }] = await Promise.all([
    supabase.from("employees").select("first_name, last_name, email, phone, whatsapp_opt_in").eq("id", employeeId).single(),
    supabase.from("organizations").select("name").eq("id", policy.org_id).single(),
  ]);
  const e = emp as any;
  if (!e) return;
  const istTime = late.clock_in_at
    ? new Date(new Date(late.clock_in_at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(11, 16)
    : "";
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  await dispatchLateNotifications({
    orgId: policy.org_id,
    orgName: (org as any)?.name ?? "your organization",
    attendanceRecordId: late.id,
    employee: {
      id: employeeId,
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
      email: e.email ?? null,
      phone: e.phone ?? null,
      whatsappOptIn: !!e.whatsapp_opt_in,
    },
    kinds,
    channels: { email: policy.channel_email, whatsapp: policy.channel_whatsapp },
    consequence: policy.consequence,
    data: {
      clockInTime: istTime,
      lateMinutes: late.late_minutes ?? 0,
      lateDaysThisMonth: count,
      thresholdDays: policy.threshold_days,
      monthLabel,
    },
  });
}
