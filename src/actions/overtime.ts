"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import {
  computeDailyOvertimeMinutes,
  computeWeeklyOvertimeMinutes,
  computeHourlyRate,
} from "@/lib/attendance/ot";
import { recomputeEntryFromLineItems } from "@/lib/payroll/recompute-entry";
import {
  DEFAULT_OT_SETTINGS,
} from "@/lib/attendance/overtime-types";
import type { OvertimeSettings } from "@/lib/attendance/overtime-types";


export type OvertimeRecord = {
  id: string;
  org_id: string;
  employee_id: string;
  employee_name: string;
  attendance_record_id: string | null;
  shift_id: string | null;
  shift_name: string | null;
  date: string;
  ot_minutes: number;
  multiplier: number;
  threshold_mode: "per_day" | "weekly";
  hourly_rate: number | null;
  amount: number | null;
  status: "pending" | "approved" | "rejected" | "pushed";
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  payroll_line_item_id: string | null;
  created_at: string;
};

// ---- Schemas ----

const SettingsSchema = z.object({
  enabled: z.boolean(),
  multiplier: z.number().min(1).max(5),
  threshold_mode: z.enum(["per_day", "weekly"]),
  weekly_threshold_hours: z.number().min(20).max(80),
  approval_required: z.boolean(),
});

const ComputeRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PushMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

// ---- Settings ----

export async function getOvertimeSettings(): Promise<ActionResult<OvertimeSettings>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const sb = createAdminSupabase();
  const { data } = await sb.from("organizations").select("settings").eq("id", user.orgId).single();
  const raw = (data as any)?.settings?.attendance?.overtime ?? {};
  const merged: OvertimeSettings = {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_OT_SETTINGS.enabled,
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : DEFAULT_OT_SETTINGS.multiplier,
    threshold_mode: raw.threshold_mode === "weekly" ? "weekly" : DEFAULT_OT_SETTINGS.threshold_mode,
    weekly_threshold_hours:
      typeof raw.weekly_threshold_hours === "number"
        ? raw.weekly_threshold_hours
        : DEFAULT_OT_SETTINGS.weekly_threshold_hours,
    approval_required:
      typeof raw.approval_required === "boolean"
        ? raw.approval_required
        : DEFAULT_OT_SETTINGS.approval_required,
  };
  return { success: true, data: merged };
}

export async function updateOvertimeSettings(
  input: z.infer<typeof SettingsSchema>,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure overtime" };
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const sb = createAdminSupabase();
  const { data: orgRow } = await sb
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();
  const existing = ((orgRow as any)?.settings ?? {}) as Record<string, any>;
  const attendance =
    existing.attendance && typeof existing.attendance === "object"
      ? (existing.attendance as Record<string, any>)
      : {};
  const nextSettings = {
    ...existing,
    attendance: {
      ...attendance,
      overtime: parsed.data,
    },
  };
  const { error } = await sb
    .from("organizations")
    .update({ settings: nextSettings } as any)
    .eq("id", user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

// ---- List ----

export async function getOvertimeRecords(input?: {
  status?: "pending" | "approved" | "rejected" | "pushed";
  from?: string;
  to?: string;
  employee_id?: string;
}): Promise<ActionResult<OvertimeRecord[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view overtime records" };

  const sb = createAdminSupabase();
  let query = sb
    .from("ot_records")
    .select("*, employees!employee_id(first_name, last_name), shifts(name)")
    .eq("org_id", user.orgId)
    .order("date", { ascending: false });

  if (input?.employee_id) {
    query = query.eq("employee_id", input.employee_id);
  }

  if (input?.status) query = query.eq("status", input.status);
  if (input?.from) query = query.gte("date", input.from);
  if (input?.to) query = query.lte("date", input.to);

  const { data, error } = await query.limit(500);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      org_id: r.org_id,
      employee_id: r.employee_id,
      employee_name: r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "Unknown",
      attendance_record_id: r.attendance_record_id,
      shift_id: r.shift_id,
      shift_name: r.shifts?.name ?? null,
      date: r.date,
      ot_minutes: r.ot_minutes,
      multiplier: Number(r.multiplier),
      threshold_mode: r.threshold_mode as "per_day" | "weekly",
      hourly_rate: r.hourly_rate,
      amount: r.amount,
      status: r.status,
      approved_by: r.approved_by,
      approved_at: r.approved_at,
      rejected_reason: r.rejected_reason,
      payroll_line_item_id: r.payroll_line_item_id,
      created_at: r.created_at,
    })),
  };
}

// ---- Compute (master toggle GATE here) ----

export async function computeAndRecordOvertime(
  input: z.infer<typeof ComputeRangeSchema>,
): Promise<ActionResult<{ inserted: number; skipped: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can compute overtime" };

  const settingsResult = await getOvertimeSettings();
  if (!settingsResult.success) return { success: false, error: settingsResult.error };
  if (!settingsResult.data.enabled) {
    return { success: false, error: "Overtime is disabled for your organisation" };
  }

  const parsed = ComputeRangeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const settings = settingsResult.data;
  const sb = createAdminSupabase();

  if (settings.threshold_mode === "per_day") {
    // Per-day OT: for each attendance_records row with shift_id in range, compute worked - shift.
    const { data: records } = await sb
      .from("attendance_records")
      .select("id, employee_id, date, total_minutes, shift_id, shifts(total_hours)")
      .eq("org_id", user.orgId)
      .not("shift_id", "is", null)
      .not("total_minutes", "is", null)
      .gte("date", parsed.data.from)
      .lte("date", parsed.data.to);

    let inserted = 0;
    let skipped = 0;
    for (const rec of ((records ?? []) as any[])) {
      const shiftMinutes = rec.shifts?.total_hours ? Number(rec.shifts.total_hours) * 60 : null;
      const ot = computeDailyOvertimeMinutes(rec.total_minutes, shiftMinutes);
      if (ot <= 0) {
        skipped++;
        continue;
      }

      const { error: insErr } = await sb.from("ot_records").upsert(
        {
          org_id: user.orgId,
          employee_id: rec.employee_id,
          attendance_record_id: rec.id,
          shift_id: rec.shift_id,
          date: rec.date,
          ot_minutes: ot,
          multiplier: settings.multiplier,
          threshold_mode: "per_day",
          status: settings.approval_required ? "pending" : "approved",
          approved_by: settings.approval_required ? null : user.employeeId,
          approved_at: settings.approval_required ? null : new Date().toISOString(),
        } as any,
        { onConflict: "employee_id,date", ignoreDuplicates: true },
      );
      if (!insErr) inserted++;
      else skipped++;
    }
    revalidatePath("/dashboard/attendance");
    return { success: true, data: { inserted, skipped } };
  } else {
    // Weekly: group by employee → sum total_minutes across the range → compute overtime.
    // Phase 2 simplification: treat the entire requested range as a single bucket per employee.
    // Caller is expected to pass a 7-day Mon-Sun window per cycle.
    const { data: records } = await sb
      .from("attendance_records")
      .select("employee_id, date, total_minutes, shift_id, shifts(total_hours)")
      .eq("org_id", user.orgId)
      .not("shift_id", "is", null)
      .not("total_minutes", "is", null)
      .gte("date", parsed.data.from)
      .lte("date", parsed.data.to);

    const byEmp = new Map<string, { total: number; lastDate: string; shiftId: string | null }>();
    for (const r of ((records ?? []) as any[])) {
      const cur = byEmp.get(r.employee_id) ?? {
        total: 0,
        lastDate: r.date,
        shiftId: r.shift_id,
      };
      cur.total += r.total_minutes ?? 0;
      if (r.date > cur.lastDate) cur.lastDate = r.date;
      byEmp.set(r.employee_id, cur);
    }
    let inserted = 0;
    let skipped = 0;
    for (const [empId, agg] of byEmp.entries()) {
      const ot = computeWeeklyOvertimeMinutes(agg.total, settings.weekly_threshold_hours);
      if (ot <= 0) {
        skipped++;
        continue;
      }
      const { error: insErr } = await sb.from("ot_records").upsert(
        {
          org_id: user.orgId,
          employee_id: empId,
          shift_id: agg.shiftId,
          date: agg.lastDate, // attribute weekly OT to the last day of the range
          ot_minutes: ot,
          multiplier: settings.multiplier,
          threshold_mode: "weekly",
          status: settings.approval_required ? "pending" : "approved",
          approved_by: settings.approval_required ? null : user.employeeId,
          approved_at: settings.approval_required ? null : new Date().toISOString(),
        } as any,
        { onConflict: "employee_id,date", ignoreDuplicates: true },
      );
      if (!insErr) inserted++;
      else skipped++;
    }
    revalidatePath("/dashboard/attendance");
    return { success: true, data: { inserted, skipped } };
  }
}

// ---- Approve / Reject / Bulk approve ----
// No `enabled` gate here — admins must be able to drain the queue after disabling.

export async function approveOvertime(recordId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can approve overtime" };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("ot_records")
    .update({
      status: "approved",
      approved_by: user.employeeId ?? null,
      approved_at: new Date().toISOString(),
      rejected_reason: null,
    } as any)
    .eq("id", recordId)
    .eq("org_id", user.orgId)
    .in("status", ["pending", "rejected"]);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

export async function rejectOvertime(
  recordId: string,
  reason: string,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can reject overtime" };
  if (!reason.trim()) return { success: false, error: "Provide a reason" };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("ot_records")
    .update({
      status: "rejected",
      rejected_reason: reason.trim(),
      approved_by: user.employeeId ?? null,
      approved_at: new Date().toISOString(),
    } as any)
    .eq("id", recordId)
    .eq("org_id", user.orgId)
    .in("status", ["pending", "approved"]);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

export async function bulkApproveOvertime(
  recordIds: string[],
): Promise<ActionResult<{ approved: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can approve overtime" };
  if (recordIds.length === 0) return { success: false, error: "Select at least one record" };
  const sb = createAdminSupabase();
  const { error, data } = await sb
    .from("ot_records")
    .update({
      status: "approved",
      approved_by: user.employeeId ?? null,
      approved_at: new Date().toISOString(),
      rejected_reason: null,
    } as any)
    .eq("org_id", user.orgId)
    .in("id", recordIds)
    .in("status", ["pending", "rejected"])
    .select("id");
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/attendance");
  return { success: true, data: { approved: ((data ?? []) as any[]).length } };
}

// ---- Push to payroll (master toggle GATE here) ----

export async function pushOvertimeToPayroll(
  input: z.infer<typeof PushMonthSchema>,
): Promise<ActionResult<{ pushed: number; skipped: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can push OT to payroll" };

  const settingsResult = await getOvertimeSettings();
  if (!settingsResult.success) return { success: false, error: settingsResult.error };
  if (!settingsResult.data.enabled) {
    return { success: false, error: "Overtime is disabled for your organisation" };
  }

  const parsed = PushMonthSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const sb = createAdminSupabase();
  const [year, monthNum] = parsed.data.month.split("-");
  const monthStart = `${year}-${monthNum}-01`;
  const monthEnd = new Date(parseInt(year, 10), parseInt(monthNum, 10), 0)
    .toISOString()
    .slice(0, 10);

  // Find the open run for this month.
  const { data: run } = await sb
    .from("payroll_runs")
    .select("id, working_days, status")
    .eq("org_id", user.orgId)
    .eq("month", parsed.data.month)
    .maybeSingle();
  if (!run) {
    return {
      success: false,
      error: `No payroll run exists for ${parsed.data.month}. Process the run first.`,
    };
  }
  if ((run as any).status === "paid") {
    return { success: false, error: "Cannot push to a paid run" };
  }

  // Find approved, not-yet-pushed OT records in the month.
  const { data: otRecords } = await sb
    .from("ot_records")
    .select("id, employee_id, shift_id, date, ot_minutes, multiplier, shifts(total_hours)")
    .eq("org_id", user.orgId)
    .eq("status", "approved")
    .is("payroll_line_item_id", null)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  if (!otRecords || otRecords.length === 0) {
    return { success: true, data: { pushed: 0, skipped: 0 } };
  }

  // Fetch entries for the run.
  const { data: entries } = await sb
    .from("payroll_entries")
    .select("id, employee_id")
    .eq("payroll_run_id", (run as any).id);
  const entryByEmp = new Map<string, string>();
  for (const e of ((entries ?? []) as any[])) entryByEmp.set(e.employee_id, e.id);

  // Fetch salary structures (gross_monthly) for all employees in the OT batch.
  const employeeIds = Array.from(new Set(((otRecords as any[]).map((r) => r.employee_id))));
  const { data: salaries } = await sb
    .from("salary_structures")
    .select("employee_id, gross_monthly")
    .eq("org_id", user.orgId)
    .in("employee_id", employeeIds);
  const salaryByEmp = new Map<string, number>();
  for (const s of ((salaries ?? []) as any[])) {
    salaryByEmp.set(s.employee_id, Number(s.gross_monthly));
  }

  let pushed = 0;
  let skipped = 0;
  const entryIdsToRecompute = new Set<string>();

  for (const ot of (otRecords as any[])) {
    const entryId = entryByEmp.get(ot.employee_id);
    if (!entryId) {
      skipped++;
      continue;
    }
    const grossMonthly = salaryByEmp.get(ot.employee_id);
    if (!grossMonthly) {
      skipped++;
      continue;
    }
    const shiftHours = ot.shifts?.total_hours ? Number(ot.shifts.total_hours) : 8;
    const hourlyRatePaise = computeHourlyRate(grossMonthly, (run as any).working_days, shiftHours);
    const amountPaise = Math.round((ot.ot_minutes / 60) * hourlyRatePaise * Number(ot.multiplier));
    const amountRupees = Math.round(amountPaise / 100);
    if (amountRupees <= 0) {
      skipped++;
      continue;
    }

    const { data: lineItem, error: insErr } = await sb
      .from("payroll_line_items")
      .insert({
        org_id: user.orgId,
        payroll_entry_id: entryId,
        category: "overtime",
        amount: amountRupees,
        taxable: true,
        note: `OT for ${ot.date} (${ot.ot_minutes}m × ${ot.multiplier}x)`,
        created_by: user.employeeId ?? null,
      } as any)
      .select("id")
      .single();
    if (insErr) {
      skipped++;
      continue;
    }

    await sb
      .from("ot_records")
      .update({
        status: "pushed",
        hourly_rate: hourlyRatePaise,
        amount: amountPaise,
        payroll_line_item_id: (lineItem as any).id,
      } as any)
      .eq("id", ot.id);

    entryIdsToRecompute.add(entryId);
    pushed++;
  }

  // Recompute TDS + roll-ups for every touched entry.
  // Uses the shared helper from src/lib/payroll/recompute-entry (also used by
  // src/actions/payroll.ts) so the math stays in lock-step with manual line-
  // item add/remove flows.
  for (const entryId of entryIdsToRecompute) {
    await recomputeEntryFromLineItems(entryId);
  }

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/payroll");
  return { success: true, data: { pushed, skipped } };
}
