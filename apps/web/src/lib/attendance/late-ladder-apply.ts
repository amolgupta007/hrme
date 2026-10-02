// Plain module — NOT "use server" (gotcha #85): raw org ids, employee PII, emails.
//
// Applies the actions planned by planLateLadder (pure, @jambahr/shared):
//   warn    → late_penalty_events row + warning email
//   deduct  → event row + leave_adjustments debit (CL part) + payroll refresh
//             (LOP part flows via payroll_entries.late_penalty_days) + email
//   reverse → event 'reversed' + compensating leave credit + payroll refresh + email
//   review  → event 'needs_review' (month's payroll already paid)
// Idempotent: event rows are unique per (org, employee, month, kind,
// occurrence); an insert that loses the race is simply skipped.

import { render } from "@react-email/render";
import { planLateLadder, type LadderEvent } from "@jambahr/shared/attendance/late-ladder";
import type { LateDay } from "@jambahr/shared/attendance/late-eligibility";
import { loadRemainingBalance } from "@/lib/leaves/balance";
import { managerIdsOf } from "@/lib/managers";
import { notify } from "@/lib/mobile/notify";
import { calculateRunEntries } from "@/lib/payroll/engine-run";
import { resend, NOREPLY_EMAIL } from "@/lib/resend";
import {
  LateArrivalNotice,
  lateArrivalSubject,
  type LateArrivalNoticeVariant,
  type LateArrivalRow,
} from "@/components/emails/late-arrival-notice";
import type { LatePolicyRow } from "@/lib/attendance/late-evaluation";

type Supabase = { from: (table: string) => any };

type EventRow = LadderEvent & {
  org_id: string;
  employee_id: string;
  month: string;
  late_count: number;
  late_record_ids: string[];
  trigger_date: string;
  cl_balance_before: number | null;
  leave_policy_id: string | null;
  created_at: string;
};

const LEAVE_LABEL: Record<string, string> = {
  casual: "casual leave",
  paid: "earned leave",
  sick: "sick leave",
  custom: "leave",
};

// ── helpers ────────────────────────────────────────────────────────────────

/** Oldest policy of the configured type — deterministic when an org has several. */
async function resolveLeavePolicy(supabase: Supabase, orgId: string, type: string) {
  const { data } = await supabase
    .from("leave_policies")
    .select("id, name, days_per_year, created_at")
    .eq("org_id", orgId)
    .eq("type", type)
    .order("created_at", { ascending: true })
    .limit(1);
  return ((data ?? []) as any[])[0] as { id: string; name: string; days_per_year: number } | undefined;
}

/** Paid (or paying out) runs are locked: LOP changes there need a human. */
async function isPayrollLocked(supabase: Supabase, orgId: string, month: string): Promise<boolean> {
  const { data } = await supabase
    .from("payroll_runs")
    .select("status")
    .eq("org_id", orgId)
    .eq("month", month)
    .in("status", ["paid", "disbursing"])
    .limit(1);
  return ((data ?? []) as any[]).length > 0;
}

const yearOf = (month: string) => Number(month.slice(0, 4));

async function loadEvents(supabase: Supabase, orgId: string, employeeId: string, month: string): Promise<EventRow[]> {
  const { data } = await supabase
    .from("late_penalty_events")
    .select("*")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .eq("month", month);
  return ((data ?? []) as any[]).map((e) => ({ ...e, cl_days: Number(e.cl_days), lop_days: Number(e.lop_days) }));
}

async function writeLedger(
  supabase: Supabase,
  args: { orgId: string; employeeId: string; policyId: string | null; month: string; days: number; eventId: string; reversal: boolean; by?: string | null }
) {
  if (!args.policyId || args.days === 0) return;
  await supabase.from("leave_adjustments").insert({
    org_id: args.orgId,
    employee_id: args.employeeId,
    policy_id: args.policyId,
    year: yearOf(args.month),
    days: args.reversal ? args.days : -args.days,
    reason: args.reversal ? "Late-arrival penalty reversed" : "Late-arrival penalty",
    source: args.reversal ? "late_penalty_reversal" : "late_penalty",
    source_ref: args.eventId,
    created_by: args.by ?? null,
  });
}

/**
 * Keep a DRAFT payroll run in step with the month's applied late-penalty LOP.
 * Processed runs are frozen (payroll engine, step 5): a change after
 * processing is picked up by reopening the month before money moves; paid
 * months are handled by the needs_review path above.
 */
export async function refreshPayrollLatePenalty(
  supabase: Supabase,
  orgId: string,
  employeeId: string,
  month: string
): Promise<void> {
  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, org_id, month, status, working_days")
    .eq("org_id", orgId)
    .eq("month", month)
    .eq("status", "draft")
    .limit(1);
  const run = ((runs ?? []) as any[])[0];
  if (!run) return;
  const { data: entry } = await supabase
    .from("payroll_entries")
    .select("id, edited_at")
    .eq("payroll_run_id", run.id)
    .eq("employee_id", employeeId)
    .maybeSingle();
  // Not calculated yet (picked up when it is), or days set by hand (the admin's call).
  if (!entry || (entry as any).edited_at) return;
  await calculateRunEntries(supabase as any, run, { employeeId });
}

// ── notifications ──────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const istHHMM = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);

function lateRows(lates: LateDay[]): LateArrivalRow[] {
  return lates.map((l) => {
    const punch = l.clock_in_at ? istHHMM(l.clock_in_at) : "—";
    const expected =
      l.clock_in_at && l.late_minutes != null
        ? istHHMM(new Date(new Date(l.clock_in_at).getTime() - l.late_minutes * 60_000).toISOString())
        : "—";
    return { date: fmtDate(l.date), expectedBy: expected, punchIn: punch, lateBy: `${l.late_minutes ?? 0} min` };
  });
}

export async function sendLadderNotice(
  supabase: Supabase,
  args: {
    policy: LatePolicyRow;
    employeeId: string;
    eventId: string;
    variant: LateArrivalNoticeVariant;
    month: string;
    lateCount: number;
    lates: LateDay[];
    deduction?: { cl: number; lop: number; before: number; effectiveDate: string };
    warningDate?: string | null;
    correctionSummary?: string;
    leaveLabel: string;
  }
): Promise<void> {
  const { policy, employeeId } = args;
  const [{ data: emp }, { data: org }] = await Promise.all([
    supabase
      .from("employees")
      .select("first_name, last_name, email, reporting_manager_id, reporting_manager_2_id")
      .eq("id", employeeId)
      .eq("org_id", policy.org_id)
      .single(),
    supabase.from("organizations").select("name").eq("id", policy.org_id).single(),
  ]);
  const e = emp as any;
  if (!e) return;
  const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "there";
  const orgName = (org as any)?.name ?? "Your organisation";
  const monthLabel = new Date(`${args.month}-01T00:00:00Z`).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // In-app + push regardless of email (phone-only staff get this only).
  const title =
    args.variant === "warning"
      ? "Attendance: formal warning"
      : args.variant === "correction"
        ? "Attendance penalty corrected"
        : "Attendance: late-arrival penalty";
  await notify(supabase, {
    orgId: policy.org_id,
    employeeId,
    type: "late_penalty",
    title,
    body: `${args.lateCount} late arrivals in ${monthLabel}.`,
    data: { eventId: args.eventId },
  });

  if (!e.email || !process.env.RESEND_API_KEY) {
    await supabase
      .from("late_penalty_events")
      .update({ email_status: e.email ? "failed" : "skipped_no_email" })
      .eq("id", args.eventId);
    return;
  }

  // CC: reporting manager(s) (+ owners/admins when configured).
  const ccIds = policy.ladder_cc_managers ? managerIdsOf(e) : [];
  const { data: ccRows } = await supabase
    .from("employees")
    .select("id, email, role")
    .eq("org_id", policy.org_id)
    .neq("status", "terminated")
    .or(
      [
        ccIds.length ? `id.in.(${ccIds.join(",")})` : null,
        policy.ladder_cc_admins ? "role.in.(owner,admin)" : null,
      ]
        .filter(Boolean)
        .join(",") || "id.is.null"
    );
  const cc = [
    ...new Set(((ccRows ?? []) as any[]).map((r) => r.email as string | null).filter((m): m is string => !!m && m !== e.email)),
  ];

  const d = args.deduction;
  const html = await render(
    LateArrivalNotice({
      variant: args.variant,
      employeeName: name,
      orgName,
      monthLabel,
      lateCount: args.lateCount,
      lates: lateRows(args.lates),
      deductAt: policy.ladder_deduct_at,
      deductDays: Number(policy.ladder_deduct_days),
      leaveTypeLabel: args.leaveLabel,
      lopFallback: policy.ladder_lop_fallback,
      disputeDays: policy.ladder_dispute_days,
      clDeducted: d?.cl,
      lopDays: d?.lop,
      clBalanceBefore: d?.before,
      clBalanceAfter: d ? Math.max(0, d.before - d.cl) : undefined,
      effectiveDate: d ? fmtDate(d.effectiveDate) : undefined,
      warningDate: args.warningDate ? fmtDate(args.warningDate) : null,
      correctionSummary: args.correctionSummary,
    })
  );
  let status: "sent" | "failed" = "sent";
  try {
    const r = await resend.emails.send({
      from: `JambaHR <${NOREPLY_EMAIL}>`,
      to: e.email,
      ...(cc.length ? { cc } : {}),
      subject: lateArrivalSubject(args.variant, name),
      html,
    });
    if ((r as any)?.error) status = "failed";
  } catch {
    status = "failed";
  }
  await supabase.from("late_penalty_events").update({ email_status: status }).eq("id", args.eventId);
}

function variantFor(cl: number, lop: number): LateArrivalNoticeVariant | null {
  if (cl > 0 && lop > 0) return "partial";
  if (cl > 0) return "deduction";
  if (lop > 0) return "lop";
  return null; // nothing to deduct (no balance and LOP fallback off)
}

// ── main ───────────────────────────────────────────────────────────────────

export async function applyLateLadder(
  supabase: Supabase,
  args: { policy: LatePolicyRow; employeeId: string; month: string; lates: LateDay[] }
): Promise<void> {
  const { policy, employeeId, month, lates } = args;
  const orgId = policy.org_id;
  const [existing, locked, leavePolicy] = await Promise.all([
    loadEvents(supabase, orgId, employeeId, month),
    isPayrollLocked(supabase, orgId, month),
    resolveLeavePolicy(supabase, orgId, policy.ladder_leave_type),
  ]);
  const clBalance = leavePolicy
    ? await loadRemainingBalance(supabase, {
        orgId,
        employeeId,
        policyId: leavePolicy.id,
        daysPerYear: Number(leavePolicy.days_per_year),
        year: yearOf(month),
      })
    : 0;
  const leaveLabel = LEAVE_LABEL[policy.ladder_leave_type] ?? "leave";

  const actions = planLateLadder({
    policy: {
      warningAt: policy.ladder_warning_at,
      deductAt: policy.ladder_deduct_at,
      deductDays: Number(policy.ladder_deduct_days),
      repeat: policy.ladder_repeat,
      lopFallback: policy.ladder_lop_fallback,
    },
    lates: lates.map((l) => ({ id: l.id, date: l.date })),
    existing,
    clBalance,
    payrollPaid: locked,
  });
  if (actions.length === 0) return;

  const warning = existing.find((e) => e.kind === "warning");
  let warningDate: string | null = warning ? warning.created_at.slice(0, 10) : null;
  let payrollTouched = false;

  for (const a of actions) {
    if (a.type === "warn") {
      const { data, error } = await supabase
        .from("late_penalty_events")
        .insert({
          org_id: orgId,
          policy_id: policy.id,
          employee_id: employeeId,
          month,
          kind: "warning",
          occurrence_no: a.occurrenceNo,
          late_count: a.lateCount,
          late_record_ids: a.lateIds,
          trigger_date: a.triggerDate,
        })
        .select("id")
        .single();
      if (error || !data) continue; // already recorded by a concurrent run
      warningDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      await sendLadderNotice(supabase, {
        policy,
        employeeId,
        eventId: (data as any).id,
        variant: "warning",
        month,
        lateCount: a.lateCount,
        lates: lates.slice(0, a.lateCount),
        leaveLabel,
      });
    }

    if (a.type === "deduct") {
      const fields = {
        late_count: a.lateCount,
        late_record_ids: a.lateIds,
        trigger_date: a.triggerDate,
        cl_days: a.cl,
        lop_days: a.lop,
        cl_balance_before: a.clBalanceBefore,
        leave_policy_id: leavePolicy?.id ?? null,
        status: a.needsReview ? "needs_review" : "applied",
        status_reason: a.needsReview ? "Payroll for this month is already paid" : null,
        status_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      let eventId: string | null = null;
      if (a.reapplyEventId) {
        const { data } = await supabase
          .from("late_penalty_events")
          .update(fields)
          .eq("id", a.reapplyEventId)
          .eq("status", "reversed")
          .select("id");
        eventId = ((data ?? []) as any[])[0]?.id ?? null;
      } else {
        const { data, error } = await supabase
          .from("late_penalty_events")
          .insert({
            org_id: orgId,
            policy_id: policy.id,
            employee_id: employeeId,
            month,
            kind: "deduction",
            occurrence_no: a.occurrenceNo,
            ...fields,
          })
          .select("id")
          .single();
        eventId = error ? null : ((data as any)?.id ?? null);
      }
      if (!eventId) continue;

      await writeLedger(supabase, {
        orgId,
        employeeId,
        policyId: leavePolicy?.id ?? null,
        month,
        days: a.cl,
        eventId,
        reversal: false,
      });
      if (a.lop > 0 && !a.needsReview) payrollTouched = true;

      const variant = variantFor(a.cl, a.lop);
      if (variant) {
        await sendLadderNotice(supabase, {
          policy,
          employeeId,
          eventId,
          variant,
          month,
          lateCount: a.lateCount,
          lates: lates.slice(0, a.lateCount),
          deduction: { cl: a.cl, lop: a.lop, before: a.clBalanceBefore, effectiveDate: a.triggerDate },
          warningDate,
          leaveLabel,
        });
      }
    }

    if (a.type === "reverse") {
      const ev = existing.find((e) => e.id === a.eventId);
      if (!ev) continue;
      const reversed = await reverseLadderEvent(supabase, ev, {
        status: "reversed",
        reason: "Late count fell below the threshold after a correction",
        by: null,
      });
      if (reversed && ev.lop_days > 0) payrollTouched = true;
      if (reversed) {
        await sendLadderNotice(supabase, {
          policy,
          employeeId,
          eventId: ev.id,
          variant: "correction",
          month,
          lateCount: lates.length,
          lates: [],
          leaveLabel,
          correctionSummary: [
            ev.cl_days > 0 ? `${ev.cl_days} ${leaveLabel} has been credited back to your balance.` : "",
            ev.lop_days > 0 ? `The ${ev.lop_days}-day loss of pay has been removed.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
    }

    if (a.type === "review") {
      await supabase
        .from("late_penalty_events")
        .update({
          status: "needs_review",
          status_reason: "Late count fell after payroll was paid — review manually",
          status_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", a.eventId)
        .eq("status", "applied");
    }
  }

  if (payrollTouched) await refreshPayrollLatePenalty(supabase, orgId, employeeId, month);
}

/**
 * Undo one applied deduction: mark it, credit the CL back. Shared by the
 * automatic reversal and the admin "waive" action. Returns false if it was no
 * longer in a reversible state (a concurrent run got there first).
 */
export async function reverseLadderEvent(
  supabase: Supabase,
  ev: Pick<EventRow, "id" | "org_id" | "employee_id" | "month" | "cl_days" | "leave_policy_id" | "status">,
  args: { status: "reversed" | "waived"; reason: string; by: string | null }
): Promise<boolean> {
  const { data } = await supabase
    .from("late_penalty_events")
    .update({
      status: args.status,
      status_reason: args.reason,
      status_by: args.by,
      status_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ev.id)
    .in("status", ["applied", "needs_review"])
    .select("id");
  if (((data ?? []) as any[]).length === 0) return false;
  await writeLedger(supabase, {
    orgId: ev.org_id,
    employeeId: ev.employee_id,
    policyId: ev.leave_policy_id,
    month: ev.month,
    days: Number(ev.cl_days),
    eventId: ev.id,
    reversal: true,
    by: args.by,
  });
  return true;
}
