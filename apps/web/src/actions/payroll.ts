"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { computeCTCBreakdown, DEFAULT_RATIO_CONFIG, type RatioConfig } from "@/lib/ctc";
import type { LineItem, LineItemCategory } from "@/lib/payroll/line-items";
import { calculateRunEntries, runSnapshot, runTotals, type CalculateResult, type RunRow } from "@/lib/payroll/engine-run";
import { writePayrollAudit } from "@/lib/payroll/engine-config";
import { sendRunPayslips } from "@/lib/payroll/payslip-email";
import { notifyPayslipPaid } from "@/lib/mobile/notify";
import type { ActionResult } from "@/types";

// ---- Types ----

export type MyCompensation = {
  ctc: number;
  state: string;
  is_metro: boolean;
  include_hra: boolean;
  effective_from: string;
  designation: string | null;
  department: string | null;
  tax_regime: "new" | "old";
  additional_deductions_annual: number;
};

export type SalaryStructureRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  ctc: number;
  basic_monthly: number;
  hra_monthly: number;
  special_allowance_monthly: number;
  gross_monthly: number;
  employee_pf_monthly: number;
  professional_tax_monthly: number;
  tds_monthly: number;
  net_monthly: number;
  state: string;
  is_metro: boolean;
  include_hra: boolean;
  effective_from: string;
  tax_regime: "new" | "old";
  additional_deductions_annual: number;
  computed_at: string | null;
};

export type PayrollRunStatus = "draft" | "processed" | "disbursing" | "disbursement_failed" | "paid";

export type PayrollRun = {
  id: string;
  month: string;
  status: PayrollRunStatus;
  working_days: number;
  total_gross: number | null;
  total_deductions: number | null;
  total_net: number | null;
  employee_count: number | null;
  notes: string | null;
  processed_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type PayrollEntry = {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string | null;
  basic_monthly: number;
  hra_monthly: number;
  special_allowance_monthly: number;
  gross_salary: number;
  employee_pf: number;
  professional_tax: number;
  tds: number;
  lop_days: number;
  lop_deduction: number;
  late_penalty_days: number;
  late_penalty_deduction: number;
  bonus: number;
  /** One-off adjustments: earnings minus deductions. */
  total_line_items: number;
  /** Days set by hand on a draft run (kept across recalculation). */
  edited: boolean;
  total_deductions: number;
  net_pay: number;
};

export type MyPayslip = {
  run_id: string;
  month: string;
  status: PayrollRunStatus;
  paid_at: string | null;
  entry_id: string;
  basic_monthly: number;
  hra_monthly: number;
  special_allowance_monthly: number;
  gross_salary: number;
  employee_pf: number;
  professional_tax: number;
  tds: number;
  lop_days: number;
  lop_deduction: number;
  bonus: number;
  total_deductions: number;
  net_pay: number;
};

// ---- Schema ----

const SalaryStructureSchema = z.object({
  employee_id: z.string().uuid(),
  ctc: z.number().positive("CTC must be positive"),
  state: z.string().default("other"),
  is_metro: z.boolean().default(true),
  include_hra: z.boolean().default(true),
  effective_from: z.string(),
  tax_regime: z.enum(["new", "old"]).default("new"),
  additional_deductions_annual: z.number().nonnegative().default(0),
});

const PayrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM (01-12)"),
  working_days: z.number().int().min(1).max(31).default(26),
  notes: z.string().optional(),
});

const RatioConfigSchema = z.object({
  basic_pct: z.number().min(10).max(80),
  hra_pct_metro: z.number().min(0).max(100),
  hra_pct_non_metro: z.number().min(0).max(100),
  gratuity_pct: z.number().min(0).max(20),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ---- Salary Structures ----

/**
 * Returns the org's active RatioConfig — the latest salary_structure_config row
 * with effective_from <= today. Returns DEFAULT_RATIO_CONFIG if none configured.
 * Server-internal helper; no auth guard (caller is always already authenticated).
 */
async function getActiveRatioConfig(orgId: string): Promise<RatioConfig> {
  const sb = createAdminSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("salary_structure_config")
    .select("basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct")
    .eq("org_id", orgId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULT_RATIO_CONFIG;
  return {
    basic_pct: Number((data as any).basic_pct),
    hra_pct_metro: Number((data as any).hra_pct_metro),
    hra_pct_non_metro: Number((data as any).hra_pct_non_metro),
    gratuity_pct: Number((data as any).gratuity_pct),
  };
}

export async function getSalaryStructureConfig(): Promise<ActionResult<{
  active: RatioConfig;
  history: SalaryStructureConfig[];
}>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view salary structure config" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("salary_structure_config")
    .select("id, basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct, effective_from, created_at")
    .eq("org_id", user.orgId)
    .order("effective_from", { ascending: false });

  if (error) return { success: false, error: error.message };

  const history = (data ?? []).map((r: any) => ({
    id: r.id,
    basic_pct: Number(r.basic_pct),
    hra_pct_metro: Number(r.hra_pct_metro),
    hra_pct_non_metro: Number(r.hra_pct_non_metro),
    gratuity_pct: Number(r.gratuity_pct),
    effective_from: r.effective_from,
    created_at: r.created_at,
  })) as SalaryStructureConfig[];

  const active = await getActiveRatioConfig(user.orgId);
  return { success: true, data: { active, history } };
}

export async function upsertSalaryStructureConfig(
  input: z.infer<typeof RatioConfigSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure salary structure ratios" };

  const parsed = RatioConfigSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("salary_structure_config")
    .upsert(
      {
        org_id: user.orgId,
        basic_pct: parsed.data.basic_pct,
        hra_pct_metro: parsed.data.hra_pct_metro,
        hra_pct_non_metro: parsed.data.hra_pct_non_metro,
        gratuity_pct: parsed.data.gratuity_pct,
        effective_from: parsed.data.effective_from,
        created_by: user.employeeId ?? null,
      } as any,
      { onConflict: "org_id,effective_from" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function previewConfigImpact(
  proposed: RatioConfig
): Promise<ActionResult<ConfigImpactRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can preview config impact" };

  const sb = createAdminSupabase();
  const [{ data: structures }, { data: employees }] = await Promise.all([
    sb.from("salary_structures")
      .select("employee_id, ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual")
      .eq("org_id", user.orgId),
    sb.from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", user.orgId),
  ]);

  const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));

  const rows: ConfigImpactRow[] = (structures ?? []).map((s: any) => {
    const emp = empMap.get(s.employee_id) as any;
    const oldB = computeCTCBreakdown(s.ctc, s.state, s.is_metro, s.include_hra, s.tax_regime ?? "new", Number(s.additional_deductions_annual ?? 0));
    const newB = computeCTCBreakdown(s.ctc, s.state, s.is_metro, s.include_hra, s.tax_regime ?? "new", Number(s.additional_deductions_annual ?? 0), proposed);
    return {
      employee_id: s.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Unknown",
      basic_monthly_old: oldB.basicMonthly,
      basic_monthly_new: newB.basicMonthly,
      hra_monthly_old: oldB.hraMonthly,
      hra_monthly_new: newB.hraMonthly,
      special_allowance_monthly_old: oldB.specialAllowanceMonthly,
      special_allowance_monthly_new: newB.specialAllowanceMonthly,
      net_monthly_old: oldB.netMonthly,
      net_monthly_new: newB.netMonthly,
    };
  });

  return { success: true, data: rows };
}

export async function getSalaryStructures(): Promise<ActionResult<SalaryStructureRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view salary structures" };

  const supabase = createAdminSupabase();

  // Two separate queries to avoid nested join issues with Supabase PostgREST
  const [{ data: structures, error }, { data: employees }, { data: departments }] = await Promise.all([
    supabase
      .from("salary_structures")
      .select("*")
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, first_name, last_name, designation, department_id")
      .eq("org_id", user.orgId),
    supabase
      .from("departments")
      .select("id, name")
      .eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const deptMap = new Map((departments ?? []).map((d: any) => [d.id, d.name]));
  const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));

  const rows: SalaryStructureRow[] = (structures ?? []).map((r: any) => {
    const emp = empMap.get(r.employee_id) as any;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Unknown",
      department: emp?.department_id ? (deptMap.get(emp.department_id) ?? null) : null,
      designation: emp?.designation ?? null,
      ctc: r.ctc,
      basic_monthly: r.basic_monthly,
      hra_monthly: r.hra_monthly,
      special_allowance_monthly: r.special_allowance_monthly,
      gross_monthly: r.gross_monthly,
      employee_pf_monthly: r.employee_pf_monthly,
      professional_tax_monthly: r.professional_tax_monthly,
      tds_monthly: r.tds_monthly,
      net_monthly: r.net_monthly,
      state: r.state,
      is_metro: r.is_metro,
      include_hra: r.include_hra ?? true,
      effective_from: r.effective_from,
      tax_regime: (r.tax_regime as "new" | "old") ?? "new",
      additional_deductions_annual: Number(r.additional_deductions_annual ?? 0),
      computed_at: r.computed_at ?? null,
    };
  });

  return { success: true, data: rows };
}

export async function getMyCompensation(): Promise<ActionResult<MyCompensation | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: true, data: null };

  const supabase = createAdminSupabase();

  const { data: structure } = await supabase
    .from("salary_structures")
    .select("ctc, state, is_metro, include_hra, effective_from, tax_regime, additional_deductions_annual")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .maybeSingle();

  if (!structure) return { success: true, data: null };

  const { data: emp } = await supabase
    .from("employees")
    .select("designation, department_id")
    .eq("id", user.employeeId)
    .eq("org_id", user.orgId)
    .single();

  let department: string | null = null;
  const departmentId = (emp as any)?.department_id ?? null;
  if (departmentId) {
    const { data: dept } = await supabase
      .from("departments")
      .select("name")
      .eq("id", departmentId)
      .single();
    department = (dept as any)?.name ?? null;
  }

  return {
    success: true,
    data: {
      ctc: (structure as any).ctc,
      state: (structure as any).state,
      is_metro: (structure as any).is_metro,
      include_hra: (structure as any).include_hra ?? true,
      effective_from: (structure as any).effective_from,
      designation: (emp as any)?.designation ?? null,
      department,
      tax_regime: ((structure as any).tax_regime as "new" | "old") ?? "new",
      additional_deductions_annual: Number((structure as any).additional_deductions_annual ?? 0),
    },
  };
}

export async function upsertSalaryStructure(
  input: z.infer<typeof SalaryStructureSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure salaries" };

  const parsed = SalaryStructureSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const { employee_id, ctc, state, is_metro, include_hra, effective_from, tax_regime, additional_deductions_annual } = parsed.data;
  const ratioConfig = await getActiveRatioConfig(user.orgId);
  const breakdown = computeCTCBreakdown(ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual, ratioConfig);

  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("salary_structures")
    .upsert(
      {
        org_id: user.orgId,
        employee_id,
        ctc,
        basic_monthly: breakdown.basicMonthly,
        hra_monthly: breakdown.hraMonthly,
        special_allowance_monthly: breakdown.specialAllowanceMonthly,
        employer_pf_monthly: breakdown.employerPfMonthly,
        employer_gratuity_annual: breakdown.employerGratuityAnnual,
        employee_pf_monthly: breakdown.employeePfMonthly,
        professional_tax_monthly: breakdown.ptMonthly,
        tds_monthly: breakdown.tdsMonthly,
        gross_monthly: breakdown.grossMonthly,
        net_monthly: breakdown.netMonthly,
        state,
        is_metro,
        include_hra,
        effective_from,
        tax_regime,
        additional_deductions_annual,
        updated_at: new Date().toISOString(),
        computed_at: new Date().toISOString(),
      },
      { onConflict: "org_id,employee_id" }
    );

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

export async function deleteSalaryStructure(employeeId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can remove salary structures" };

  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("salary_structures")
    .delete()
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

/**
 * Re-runs computeCTCBreakdown for every salary_structures row in the caller's
 * org using the latest active RatioConfig. Use after `upsertSalaryStructureConfig`
 * to propagate new ratios into existing employee structures.
 */
export async function recomputeAllSalaryStructures(): Promise<ActionResult<{ recomputed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can recompute salary structures" };

  const sb = createAdminSupabase();
  const ratioConfig = await getActiveRatioConfig(user.orgId);
  const { data: structures, error } = await sb
    .from("salary_structures")
    .select("id, employee_id, ctc, state, is_metro, include_hra, effective_from, tax_regime, additional_deductions_annual")
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  let recomputed = 0;
  for (const row of (structures ?? []) as any[]) {
    const breakdown = computeCTCBreakdown(
      row.ctc,
      row.state,
      row.is_metro,
      row.include_hra,
      (row.tax_regime as "new" | "old") ?? "new",
      Number(row.additional_deductions_annual ?? 0),
      ratioConfig
    );
    const { error: updErr } = await sb
      .from("salary_structures")
      .update({
        basic_monthly: breakdown.basicMonthly,
        hra_monthly: breakdown.hraMonthly,
        special_allowance_monthly: breakdown.specialAllowanceMonthly,
        employer_pf_monthly: breakdown.employerPfMonthly,
        employer_gratuity_annual: breakdown.employerGratuityAnnual,
        employee_pf_monthly: breakdown.employeePfMonthly,
        professional_tax_monthly: breakdown.ptMonthly,
        tds_monthly: breakdown.tdsMonthly,
        gross_monthly: breakdown.grossMonthly,
        net_monthly: breakdown.netMonthly,
        updated_at: new Date().toISOString(),
        computed_at: new Date().toISOString(),
      } as any)
      .eq("id", row.id);
    if (!updErr) recomputed++;
  }

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/settings");
  return { success: true, data: { recomputed } };
}

// ---- Payroll Runs ----

export async function getPayrollRuns(): Promise<ActionResult<PayrollRun[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view payroll runs" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("org_id", user.orgId)
    .order("month", { ascending: false });

  if (error) return { success: false, error: error.message };

  return { success: true, data: (data ?? []) as PayrollRun[] };
}

export async function createPayrollRun(
  input: z.infer<typeof PayrollRunSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can create payroll runs" };

  const parsed = PayrollRunSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("payroll_runs")
    .insert({
      org_id: user.orgId,
      month: parsed.data.month,
      working_days: parsed.data.working_days,
      notes: parsed.data.notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "A payroll run already exists for this month" };
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/payroll");
  return { success: true, data: { id: (data as { id: string }).id } };
}

async function loadOwnRun(supabase: ReturnType<typeof createAdminSupabase>, orgId: string, runId: string): Promise<RunRow | null> {
  const { data } = await supabase
    .from("payroll_runs")
    .select("id, org_id, month, status, working_days")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

/** Shown whenever a change is attempted on a run that isn't a draft. */
const LOCKED_RUN = "This month's payroll is processed and locked. Reopen it to make changes.";

/**
 * Calculates (or recalculates) a draft run's entries on the payroll engine.
 * The run stays a draft: entries can be reviewed, edited and recalculated
 * freely until it is processed. Rules are chosen by the run's PAY MONTH.
 */
export async function calculatePayrollRun(runId: string): Promise<ActionResult<CalculateResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can calculate payroll" };
  const supabase = createAdminSupabase();
  const run = await loadOwnRun(supabase, user.orgId, runId);
  if (!run) return { success: false, error: "Payroll run not found" };
  if (run.status !== "draft") return { success: false, error: LOCKED_RUN };
  try {
    const result = await calculateRunEntries(supabase as any, run);
    const totals = await runTotals(supabase as any, run.id);
    const { error } = await supabase.from("payroll_runs").update(totals as any).eq("id", run.id).eq("org_id", user.orgId);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/payroll");
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not calculate payroll" };
  }
}

/**
 * Processes a draft run: recalculates every entry one last time, then freezes
 * the run — entries carry a full snapshot (lines, employee details, rule
 * versions with their params) and the run records the settings and rules it
 * used. Later changes to salaries, settings or rules never alter it.
 */
export async function processPayrollRun(runId: string): Promise<ActionResult<CalculateResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can process payroll" };
  const supabase = createAdminSupabase();
  const run = await loadOwnRun(supabase, user.orgId, runId);
  if (!run) return { success: false, error: "Payroll run not found" };
  if (run.status !== "draft") return { success: false, error: "Only draft runs can be processed" };

  try {
    const result = await calculateRunEntries(supabase as any, run);
    if (result.calculated === 0) {
      const why = result.skipped.map((x) => `${x.name} (${x.reason})`).join(", ") || "no salaries set";
      return { success: false, error: `Nobody could be paid for ${run.month}: ${why}` };
    }
    const totals = await runTotals(supabase as any, run.id);
    const snapshot = await runSnapshot(supabase as any, run);
    const { data: updated, error } = await supabase
      .from("payroll_runs")
      .update({
        ...totals,
        ...snapshot,
        status: "processed",
        processed_at: new Date().toISOString(),
        structure_config_snapshot: null,
      } as any)
      .eq("id", run.id)
      .eq("org_id", user.orgId)
      .eq("status", "draft")
      .select("id");
    if (error) return { success: false, error: error.message };
    if (!updated?.length) return { success: false, error: "The run changed while it was being processed — reload and try again" };

    const auditErr = await writePayrollAudit(supabase as any, user.orgId, user.employeeId ?? null, [{
      entity: "run", entityId: run.id, action: "transition", field: `${run.month}.status`,
      oldValue: "draft", newValue: { status: "processed", ...totals, skipped: result.skipped, excluded: result.excluded },
    }]);
    if (auditErr) console.warn("[payroll] process audit write failed", auditErr);
    revalidatePath("/dashboard/payroll");
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not process payroll" };
  }
}

/**
 * Reopens a processed run for corrections — only before any money has moved
 * (no payout started). After that, corrections go into a later month's run
 * as an adjustment instead. Reason required; audited.
 */
export async function reopenPayrollRun(runId: string, reason: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can reopen payroll" };
  const why = (reason ?? "").trim();
  if (why.length < 3) return { success: false, error: "Say why this month is being reopened" };
  const supabase = createAdminSupabase();
  const run = await loadOwnRun(supabase, user.orgId, runId);
  if (!run) return { success: false, error: "Payroll run not found" };
  if (run.status !== "processed") {
    return {
      success: false,
      error: run.status === "draft" ? "This run is already open" : "Money has already moved for this month — add a correction to a later month's run instead",
    };
  }
  const { data: batches, error: bErr } = await supabase
    .from("disbursement_batches").select("id").eq("payroll_run_id", run.id).neq("status", "cancelled").limit(1);
  if (bErr) return { success: false, error: bErr.message };
  if ((batches ?? []).length > 0) return { success: false, error: "A payout has been started for this month — cancel it before reopening" };

  const { data: before } = await supabase
    .from("payroll_runs").select("total_gross, total_deductions, total_net, employee_count, processed_at").eq("id", run.id).single();
  const { data: updated, error } = await supabase
    .from("payroll_runs")
    .update({ status: "draft", processed_at: null } as any)
    .eq("id", run.id).eq("org_id", user.orgId).eq("status", "processed")
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!updated?.length) return { success: false, error: "The run changed — reload and try again" };
  const auditErr = await writePayrollAudit(supabase as any, user.orgId, user.employeeId ?? null, [{
    entity: "run", entityId: run.id, action: "transition", field: `${run.month}.status`,
    oldValue: { status: "processed", ...((before as object) ?? {}) }, newValue: "draft", reason: why,
  }]);
  if (auditErr) return { success: false, error: `Reopened, but the change could not be logged: ${auditErr}` };
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

/** Recalculates one employee's entry in a draft run (after an edit or a line-item change). */
async function recalculateDraftEntry(supabase: ReturnType<typeof createAdminSupabase>, orgId: string, entryId: string): Promise<string | null> {
  const { data: entry } = await supabase
    .from("payroll_entries").select("employee_id, payroll_run_id").eq("id", entryId).eq("org_id", orgId).maybeSingle();
  if (!entry) return "Entry not found";
  const run = await loadOwnRun(supabase, orgId, (entry as any).payroll_run_id);
  if (!run) return "Payroll run not found";
  if (run.status !== "draft") return LOCKED_RUN;
  try {
    await calculateRunEntries(supabase as any, run, { employeeId: (entry as any).employee_id });
    const totals = await runTotals(supabase as any, run.id);
    await supabase.from("payroll_runs").update(totals as any).eq("id", run.id);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not recalculate";
  }
}

export async function sendPayslipEmail(runId: string): Promise<ActionResult<{ sent: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can send payslips" };

  const sb = createAdminSupabase();
  const { data: run } = await sb.from("payroll_runs").select("id, org_id, status").eq("id", runId).single();
  if (!run || (run as any).org_id !== user.orgId) return { success: false, error: "Run not found" };
  if ((run as any).status === "draft") return { success: false, error: "Process the run before sending payslips" };

  // Sends (or re-sends) every entry, each with its PDF pay slip attached.
  const { sent, failed } = await sendRunPayslips(sb as any, user.orgId, runId);
  return { success: true, data: { sent, failed } };
}

export async function markPayrollPaid(runId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can mark payroll as paid" };

  const supabase = createAdminSupabase();

  const { data: paidRows, error } = await supabase
    .from("payroll_runs")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: user.employeeId ?? null,
    })
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .eq("status", "processed")
    .select("id");

  if (error) return { success: false, error: error.message };
  if (!(paidRows ?? []).length) return { success: false, error: "Only a processed run can be marked paid" };

  revalidatePath("/dashboard/payroll");
  // Best-effort payslip email — survives function freeze via waitUntil.
  try { waitUntil(sendRunPayslips(supabase as any, user.orgId, runId, { onlyUnsent: true }).then(() => undefined)); } catch {}
  return { success: true, data: undefined };
}

export async function deletePayrollRun(runId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete payroll runs" };

  const supabase = createAdminSupabase();

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("status")
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .single();

  const status = (run as any)?.status as string | undefined;
  if (status && status !== "draft" && status !== "processed") {
    return { success: false, error: "Money has moved for this run — it can't be deleted" };
  }
  const { data: batches } = await supabase
    .from("disbursement_batches").select("id").eq("payroll_run_id", runId).neq("status", "cancelled").limit(1);
  if ((batches ?? []).length > 0) return { success: false, error: "A payout has been started for this run — cancel it first" };

  await supabase.from("payroll_entries").delete().eq("payroll_run_id", runId);
  const { error } = await supabase
    .from("payroll_runs")
    .delete()
    .eq("id", runId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

// ---- Payroll Entries ----

export async function getPayrollEntries(runId: string): Promise<ActionResult<PayrollEntry[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view payroll entries" };

  const supabase = createAdminSupabase();

  const [{ data: entries, error }, { data: employees }, { data: departments }] = await Promise.all([
    supabase
      .from("payroll_entries")
      .select("id, employee_id, basic_monthly, hra_monthly, special_allowance_monthly, gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, late_penalty_days, late_penalty_deduction, bonus, total_line_items, edited_at, total_deductions, net_pay")
      .eq("payroll_run_id", runId)
      .eq("org_id", user.orgId)
      .order("created_at"),
    supabase
      .from("employees")
      .select("id, first_name, last_name, department_id")
      .eq("org_id", user.orgId),
    supabase
      .from("departments")
      .select("id, name")
      .eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const deptMap = new Map((departments ?? []).map((d: any) => [d.id, d.name]));
  const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));

  const rows: PayrollEntry[] = (entries ?? []).map((r: any) => {
    const emp = empMap.get(r.employee_id) as any;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "Unknown",
      department: emp?.department_id ? (deptMap.get(emp.department_id) ?? null) : null,
      basic_monthly: r.basic_monthly,
      hra_monthly: r.hra_monthly,
      special_allowance_monthly: r.special_allowance_monthly,
      gross_salary: r.gross_salary,
      employee_pf: r.employee_pf,
      professional_tax: r.professional_tax,
      tds: r.tds,
      lop_days: r.lop_days,
      lop_deduction: r.lop_deduction,
      late_penalty_days: Number(r.late_penalty_days ?? 0),
      late_penalty_deduction: r.late_penalty_deduction ?? 0,
      bonus: r.bonus,
      total_line_items: Number(r.total_line_items ?? 0),
      edited: !!r.edited_at,
      total_deductions: r.total_deductions,
      net_pay: r.net_pay,
    };
  });

  return { success: true, data: rows };
}

export async function updatePayrollEntry(
  entryId: string,
  updates: { bonus?: number; lop_days: number; late_penalty_days?: number }
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit payroll entries" };
  if (!(updates.lop_days >= 0) || updates.lop_days > 31) return { success: false, error: "LOP days must be between 0 and 31" };
  if (updates.late_penalty_days !== undefined && (!(updates.late_penalty_days >= 0) || updates.late_penalty_days > 31)) {
    return { success: false, error: "Late-penalty days must be between 0 and 31" };
  }

  const supabase = createAdminSupabase();
  const { data: entry, error: fetchErr } = await supabase
    .from("payroll_entries")
    .select("net_pay, payroll_run_id, employee_id, lop_days, late_penalty_days")
    .eq("id", entryId)
    .eq("org_id", user.orgId)
    .single();
  if (fetchErr || !entry) return { success: false, error: "Entry not found" };
  const e = entry as any;
  const run = await loadOwnRun(supabase, user.orgId, e.payroll_run_id);
  if (!run) return { success: false, error: "Payroll run not found" };
  if (run.status !== "draft") return { success: false, error: LOCKED_RUN };

  // Marking the entry as edited makes recalculation keep these days instead of re-deriving them.
  const { error } = await supabase
    .from("payroll_entries")
    .update({
      lop_days: updates.lop_days,
      late_penalty_days: updates.late_penalty_days ?? e.late_penalty_days ?? 0,
      previous_net_pay: e.net_pay,
      edited_by: user.employeeId ?? null,
      edited_at: new Date().toISOString(),
    } as any)
    .eq("id", entryId)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  const recalcErr = await recalculateDraftEntry(supabase, user.orgId, entryId);
  if (recalcErr) return { success: false, error: recalcErr };
  const auditErr = await writePayrollAudit(supabase as any, user.orgId, user.employeeId ?? null, [{
    entity: "entry", entityId: entryId, action: "update", field: `${run.month}.${e.employee_id}`,
    oldValue: { lop_days: e.lop_days, late_penalty_days: e.late_penalty_days, net_pay: e.net_pay },
    newValue: { lop_days: updates.lop_days, late_penalty_days: updates.late_penalty_days ?? e.late_penalty_days },
  }]);
  if (auditErr) console.warn("[payroll] entry audit write failed", auditErr);
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

export async function getMyPayslips(): Promise<ActionResult<MyPayslip[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: true, data: [] };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("payroll_entries")
    .select(`
      id, basic_monthly, hra_monthly, special_allowance_monthly,
      gross_salary, employee_pf, professional_tax, tds,
      lop_days, lop_deduction, bonus, total_deductions, net_pay,
      payroll_runs!payroll_run_id(id, month, status, paid_at)
    `)
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows: MyPayslip[] = (data ?? []).map((r: any) => ({
    run_id: r.payroll_runs.id,
    month: r.payroll_runs.month,
    status: r.payroll_runs.status,
    paid_at: r.payroll_runs.paid_at,
    entry_id: r.id,
    basic_monthly: r.basic_monthly,
    hra_monthly: r.hra_monthly,
    special_allowance_monthly: r.special_allowance_monthly,
    gross_salary: r.gross_salary,
    employee_pf: r.employee_pf,
    professional_tax: r.professional_tax,
    tds: r.tds,
    lop_days: r.lop_days,
    lop_deduction: r.lop_deduction,
    bonus: r.bonus,
    total_deductions: r.total_deductions,
    net_pay: r.net_pay,
  }));

  // Exclude drafts — admin is still editing, not relevant to the employee yet
  const filtered = rows.filter((r) => r.status !== "draft");
  return { success: true, data: filtered };
}

export type SalaryStructureConfig = RatioConfig & {
  id: string;
  effective_from: string;
  created_at: string;
};

export type ConfigImpactRow = {
  employee_id: string;
  employee_name: string;
  basic_monthly_old: number;
  basic_monthly_new: number;
  hra_monthly_old: number;
  hra_monthly_new: number;
  special_allowance_monthly_old: number;
  special_allowance_monthly_new: number;
  net_monthly_old: number;
  net_monthly_new: number;
};

export type PayrollLineItemRow = LineItem & {
  payroll_entry_id: string;
  created_at: string;
};

// ---- Payroll Line Items ----

const LineItemSchema = z.object({
  payroll_entry_id: z.string().uuid(),
  category: z.enum(["bonus", "allowance", "reimbursement", "other"]),
  amount: z.number().int().min(0).max(10_000_000),
  taxable: z.boolean().default(true),
  note: z.string().max(280).nullable().optional(),
  override: z.boolean().optional(), // bypass late-policy bonus block (admin)
});

export async function listPayrollLineItems(entryId: string): Promise<ActionResult<PayrollLineItemRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const sb = createAdminSupabase();
  const { data: entry } = await sb
    .from("payroll_entries")
    .select("id, org_id, employee_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { success: false, error: "Entry not found" };
  if ((entry as any).org_id !== user.orgId) return { success: false, error: "Unauthorized" };
  // Non-admins may only read their own entry's line items.
  if (!isAdmin(user.role) && (entry as any).employee_id !== user.employeeId) {
    return { success: false, error: "Unauthorized" };
  }

  const { data, error } = await sb
    .from("payroll_line_items")
    .select("*")
    .eq("payroll_entry_id", entryId)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      payroll_entry_id: r.payroll_entry_id,
      category: r.category as LineItemCategory,
      amount: r.amount,
      taxable: r.taxable,
      note: r.note,
      created_at: r.created_at,
    })),
  };
}

export async function addPayrollLineItem(input: z.infer<typeof LineItemSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can add line items" };
  const parsed = LineItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const sb = createAdminSupabase();
  // Verify the entry is in caller's org and the run is not paid.
  const { data: entry } = await sb
    .from("payroll_entries")
    .select("id, org_id, payroll_run_id")
    .eq("id", parsed.data.payroll_entry_id)
    .single();
  if (!entry || (entry as any).org_id !== user.orgId) return { success: false, error: "Entry not found" };

  const { data: run } = await sb
    .from("payroll_runs")
    .select("status")
    .eq("id", (entry as any).payroll_run_id)
    .single();
  if ((run as any)?.status !== "draft") return { success: false, error: LOCKED_RUN };

  // Late-policy bonus block: refuse a bonus for an employee flagged this month.
  if (parsed.data.category === "bonus" && !parsed.data.override) {
    const { data: runRow } = await sb
      .from("payroll_runs").select("month").eq("id", (entry as any).payroll_run_id).single();
    const { data: entryRow } = await sb
      .from("payroll_entries").select("employee_id").eq("id", (entry as any).id).single();
    // Only a policy whose consequence blocks the bonus may refuse it (flags are
    // also created under salary-deduction / none, where no bonus block applies).
    const { data: bonusPolicy } = await sb
      .from("late_policies")
      .select("enabled, consequence")
      .eq("org_id", user.orgId)
      .maybeSingle();
    const blocksBonus =
      !!bonusPolicy &&
      (bonusPolicy as any).enabled &&
      ["block_bonus", "both"].includes((bonusPolicy as any).consequence);
    if (blocksBonus && runRow && entryRow) {
      const { data: flag } = await sb
        .from("late_policy_flags").select("late_days_count, status")
        .eq("org_id", user.orgId)
        .eq("employee_id", (entryRow as any).employee_id)
        .eq("month", (runRow as any).month)
        .maybeSingle();
      if (flag && (flag as any).status === "flagged") {
        return {
          success: false,
          error: `Employee is bonus-ineligible this month (${(flag as any).late_days_count} late days). Override required.`,
        };
      }
    }
  }

  const { data, error } = await sb
    .from("payroll_line_items")
    .insert({
      org_id: user.orgId,
      payroll_entry_id: parsed.data.payroll_entry_id,
      category: parsed.data.category,
      amount: parsed.data.amount,
      taxable: parsed.data.taxable,
      note: parsed.data.note ?? null,
      created_by: user.employeeId ?? null,
    } as any)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  const recalcErr = await recalculateDraftEntry(sb, user.orgId, (entry as any).id);
  if (recalcErr) return { success: false, error: recalcErr };
  revalidatePath("/dashboard/payroll");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function removePayrollLineItem(itemId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can remove line items" };

  const sb = createAdminSupabase();
  const { data: item } = await sb
    .from("payroll_line_items")
    .select("id, org_id, payroll_entry_id")
    .eq("id", itemId)
    .single();
  if (!item || (item as any).org_id !== user.orgId) return { success: false, error: "Line item not found" };

  const { data: entry } = await sb
    .from("payroll_entries")
    .select("payroll_run_id")
    .eq("id", (item as any).payroll_entry_id)
    .single();
  const { data: run } = await sb
    .from("payroll_runs")
    .select("status")
    .eq("id", (entry as any).payroll_run_id)
    .single();
  if ((run as any)?.status !== "draft") return { success: false, error: LOCKED_RUN };

  const { error } = await sb.from("payroll_line_items").delete().eq("id", itemId);
  if (error) return { success: false, error: error.message };

  const recalcErr = await recalculateDraftEntry(sb, user.orgId, (item as any).payroll_entry_id);
  if (recalcErr) return { success: false, error: recalcErr };
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

// Entry recalculation goes through the payroll engine (`calculateRunEntries`
// in src/lib/payroll/engine-run.ts), shared with the overtime push and the
// late-penalty ladder. Only draft runs are ever recalculated.
