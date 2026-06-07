"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { render } from "@react-email/render";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { computeCTCBreakdown, getProfessionalTax, computeTaxByRegime, computeAdditionalTaxOnBonus, computeMonthsInFY, DEFAULT_RATIO_CONFIG, type RatioConfig } from "@/lib/ctc";
import type { LineItem, LineItemCategory } from "@/lib/payroll/line-items";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { PayslipEmail } from "@/components/emails/payslip";
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

export type PayrollRun = {
  id: string;
  month: string;
  status: "draft" | "processed" | "paid";
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
  bonus: number;
  total_deductions: number;
  net_pay: number;
};

export type MyPayslip = {
  run_id: string;
  month: string;
  status: "draft" | "processed" | "paid";
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

export async function processPayrollRun(runId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can process payroll" };

  const supabase = createAdminSupabase();

  // Fetch the run
  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .single();

  if (runError || !run) return { success: false, error: "Payroll run not found" };
  const runData = run as any;
  if (runData.status !== "draft") return { success: false, error: "Only draft runs can be processed" };

  // PRD 02 Phase 1: snapshot the active ratio config for immutability.
  const activeRatioConfig = await getActiveRatioConfig(user.orgId);
  const { data: configRow } = await supabase
    .from("salary_structure_config")
    .select("id, effective_from")
    .eq("org_id", user.orgId)
    .lte("effective_from", new Date().toISOString().slice(0, 10))
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const configSnapshot = {
    ...activeRatioConfig,
    effective_from: (configRow as any)?.effective_from ?? null,
    config_id: (configRow as any)?.id ?? null,
  };

  // Compute month boundaries upfront — used for salary effective-from filter and approved-leaves lookup
  const [year, monthNum] = runData.month.split("-");
  const monthStart = `${year}-${monthNum}-01`;
  const monthEnd = new Date(parseInt(year), parseInt(monthNum), 0)
    .toISOString()
    .split("T")[0];

  // P-013: only include salary structures effective on or before this run's month start
  const { data: salaries, error: salaryError } = await supabase
    .from("salary_structures")
    .select(`
      employee_id, gross_monthly, basic_monthly, hra_monthly,
      special_allowance_monthly, employee_pf_monthly,
      professional_tax_monthly, tds_monthly, net_monthly, state,
      tax_regime, additional_deductions_annual
    `)
    .eq("org_id", user.orgId)
    .lte("effective_from", monthStart);

  if (salaryError) return { success: false, error: salaryError.message };
  if (!salaries || salaries.length === 0) {
    return {
      success: false,
      error: `No salary structures effective on or before ${monthStart}. Configure salaries for active employees first.`,
    };
  }

  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("employee_id, days, leave_policies(type)")
    .eq("org_id", user.orgId)
    .eq("status", "approved")
    .gte("start_date", monthStart)
    .lte("end_date", monthEnd);

  // Build LOP map: employee_id → lop_days (unpaid leaves only)
  const lopMap: Record<string, number> = {};
  for (const leave of leaves ?? []) {
    const l = leave as any;
    const leaveType = l.leave_policies?.type;
    // Count as LOP only if not a paid/sick/casual type — i.e., unpaid
    if (leaveType === "unpaid") {
      lopMap[l.employee_id] = (lopMap[l.employee_id] ?? 0) + (l.days ?? 0);
    }
  }

  // P-002: fetch each employee's date_of_joining for mid-FY income projection.
  const employeeIds = (salaries as any[]).map((s) => s.employee_id);
  const { data: emps } = await supabase
    .from("employees")
    .select("id, date_of_joining")
    .eq("org_id", user.orgId)
    .in("id", employeeIds);
  const joiningMap = new Map<string, string | null>(
    (emps ?? []).map((e: any) => [e.id, (e.date_of_joining as string | null) ?? null])
  );

  // PRD 02 Phase 1: pre-fetch line items grouped by employee. On FIRST process
  // this map is empty (line items are added AFTER process). On REPROCESS the
  // ON DELETE CASCADE on the entry FK has already cleared old entries' line
  // items (entries delete below) so the map is still empty here. Kept for
  // structural consistency with recomputeEntryFromLineItems.
  const existingLineItemsByEmployee = new Map<string, Array<{ amount: number; taxable: boolean }>>();

  // Build entries — TDS is projected over months_in_fy so mid-FY joiners aren't
  // over-deducted. Stored on each entry for later read-back in updatePayrollEntry.
  const entries = (salaries as any[]).map((s) => {
    const lopDays = lopMap[s.employee_id] ?? 0;
    const lopDeduction = lopDays > 0
      ? Math.round((s.gross_monthly / runData.working_days) * lopDays)
      : 0;

    const regime: "new" | "old" = (s.tax_regime as "new" | "old") ?? "new";
    const standardDeduction = regime === "old" ? 50000 : 75000;
    const allowedExtraDed =
      regime === "old" ? Number(s.additional_deductions_annual ?? 0) : 0;
    const monthsInFY = computeMonthsInFY(runData.month, joiningMap.get(s.employee_id) ?? null);
    const annualTaxableIncome = Math.max(
      0,
      s.gross_monthly * monthsInFY -
        s.employee_pf_monthly * monthsInFY -
        standardDeduction -
        allowedExtraDed
    );
    const annualTax = computeTaxByRegime(annualTaxableIncome, regime);
    const monthlyTds = Math.round(annualTax / monthsInFY);

    const lineItems = existingLineItemsByEmployee.get(s.employee_id) ?? [];
    const taxableLineSum = lineItems.filter((i) => i.taxable).reduce((a, b) => a + b.amount, 0);
    const nonTaxableLineSum = lineItems.filter((i) => !i.taxable).reduce((a, b) => a + b.amount, 0);
    const totalLineItems = taxableLineSum + nonTaxableLineSum;
    const bonusTax = computeAdditionalTaxOnBonus(annualTaxableIncome, taxableLineSum, regime);
    const adjustedTds = monthlyTds + bonusTax;

    const totalDeductions =
      s.employee_pf_monthly + s.professional_tax_monthly + adjustedTds + lopDeduction;
    const netPay = Math.max(0, s.gross_monthly + totalLineItems - totalDeductions);

    return {
      payroll_run_id: runId,
      org_id: user.orgId,
      employee_id: s.employee_id,
      basic_monthly: s.basic_monthly,
      hra_monthly: s.hra_monthly,
      special_allowance_monthly: s.special_allowance_monthly,
      gross_salary: s.gross_monthly,
      employee_pf: s.employee_pf_monthly,
      professional_tax: s.professional_tax_monthly,
      tds: adjustedTds,
      lop_days: lopDays,
      lop_deduction: lopDeduction,
      bonus: 0, // legacy column kept for back-compat; line items are the new path
      total_line_items: totalLineItems,
      total_deductions: totalDeductions,
      net_pay: netPay,
      annual_taxable_income: annualTaxableIncome,
      months_in_fy: monthsInFY,
    };
  });

  // Delete existing entries if reprocessing
  await supabase.from("payroll_entries").delete().eq("payroll_run_id", runId);

  const { error: entryError } = await supabase.from("payroll_entries").insert(entries);
  if (entryError) return { success: false, error: entryError.message };

  const totalGross = entries.reduce((s, e) => s + e.gross_salary, 0);
  const totalDeductions = entries.reduce((s, e) => s + e.total_deductions, 0);
  const totalNet = entries.reduce((s, e) => s + e.net_pay, 0);

  const { error: updateError } = await supabase
    .from("payroll_runs")
    .update({
      status: "processed",
      total_gross: Math.round(totalGross),
      total_deductions: Math.round(totalDeductions),
      total_net: Math.round(totalNet),
      employee_count: entries.length,
      processed_at: new Date().toISOString(),
      structure_config_snapshot: configSnapshot,
    })
    .eq("id", runId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

/**
 * Sends payslip emails for every entry in a processed (or paid) run.
 * Records one row in payslip_deliveries per (entry, channel='email').
 * Best-effort; never throws — failures are recorded as status='failed'.
 */
export async function sendPayslipEmail(runId: string): Promise<ActionResult<{ sent: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can send payslips" };

  const sb = createAdminSupabase();
  const { data: run } = await sb.from("payroll_runs").select("id, org_id, month, status").eq("id", runId).single();
  if (!run || (run as any).org_id !== user.orgId) return { success: false, error: "Run not found" };
  const status = (run as any).status as string;
  if (status === "draft") return { success: false, error: "Process the run before sending payslips" };

  const { data: org } = await sb.from("organizations").select("name").eq("id", user.orgId).single();
  const orgName = (org as any)?.name ?? "Your employer";

  const { data: entries } = await sb
    .from("payroll_entries")
    .select(`id, employee_id, basic_monthly, hra_monthly, special_allowance_monthly, gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, total_line_items, total_deductions, net_pay, employees!employee_id(first_name, last_name, email)`)
    .eq("payroll_run_id", runId)
    .eq("org_id", user.orgId);

  let sent = 0, failed = 0;
  for (const ent of (entries ?? []) as any[]) {
    const email = ent.employees?.email;
    if (!email) { failed++; continue; }
    const employeeName = `${ent.employees.first_name} ${ent.employees.last_name}`;

    const { data: items } = await sb.from("payroll_line_items").select("category, amount, taxable, note").eq("payroll_entry_id", ent.id);

    try {
      const html = await render(PayslipEmail({
        orgName,
        employeeName,
        month: (run as any).month,
        basicMonthly: ent.basic_monthly,
        hraMonthly: ent.hra_monthly,
        specialAllowanceMonthly: ent.special_allowance_monthly,
        grossSalary: ent.gross_salary,
        employeePf: ent.employee_pf,
        professionalTax: ent.professional_tax,
        tds: ent.tds,
        lopDays: ent.lop_days,
        lopDeduction: ent.lop_deduction,
        lineItems: ((items ?? []) as any[]).map((i) => ({ category: i.category, amount: i.amount, note: i.note, taxable: i.taxable })),
        totalDeductions: ent.total_deductions,
        netPay: ent.net_pay,
        viewInAppUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard/payroll`,
      }));

      const sendResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Payslip — ${(run as any).month}`,
        html,
      });

      await sb.from("payslip_deliveries").upsert({
        org_id: user.orgId,
        payroll_entry_id: ent.id,
        channel: "email",
        status: sendResult.error ? "failed" : "sent",
        sent_at: sendResult.error ? null : new Date().toISOString(),
        error: sendResult.error ? sendResult.error.message : null,
        resend_message_id: sendResult.data?.id ?? null,
      } as any, { onConflict: "payroll_entry_id,channel" });
      if (sendResult.error) failed++; else sent++;
    } catch (err: any) {
      await sb.from("payslip_deliveries").upsert({
        org_id: user.orgId,
        payroll_entry_id: ent.id,
        channel: "email",
        status: "failed",
        error: err?.message ?? "send failed",
      } as any, { onConflict: "payroll_entry_id,channel" });
      failed++;
    }
  }

  revalidatePath("/dashboard/payroll");
  return { success: true, data: { sent, failed } };
}

export async function markPayrollPaid(runId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can mark payroll as paid" };

  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("payroll_runs")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: user.employeeId ?? null,
    })
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .eq("status", "processed");

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/payroll");
  // Best-effort payslip email — survives function freeze via waitUntil.
  try { waitUntil(sendPayslipEmail(runId).then(() => undefined)); } catch {}
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

  if ((run as any)?.status === "paid") {
    return { success: false, error: "Cannot delete a paid payroll run" };
  }

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
      .select("id, employee_id, basic_monthly, hra_monthly, special_allowance_monthly, gross_salary, employee_pf, professional_tax, tds, lop_days, lop_deduction, bonus, total_deductions, net_pay")
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
      bonus: r.bonus,
      total_deductions: r.total_deductions,
      net_pay: r.net_pay,
    };
  });

  return { success: true, data: rows };
}

export async function updatePayrollEntry(
  entryId: string,
  updates: { bonus: number; lop_days: number }
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit payroll entries" };

  const supabase = createAdminSupabase();

  // Fetch current entry (net_pay captured for previous_net_pay audit column)
  const { data: entry, error: fetchErr } = await supabase
    .from("payroll_entries")
    .select("gross_salary, employee_pf, professional_tax, tds, net_pay, payroll_run_id, employee_id, annual_taxable_income, months_in_fy")
    .eq("id", entryId)
    .eq("org_id", user.orgId)
    .single();

  if (fetchErr || !entry) return { success: false, error: "Entry not found" };
  const e = entry as any;

  // Fetch working days from run
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("working_days, status")
    .eq("id", e.payroll_run_id)
    .single();

  if ((run as any)?.status === "paid") {
    return { success: false, error: "Cannot edit entries in a paid payroll run" };
  }

  const workingDays = (run as any)?.working_days ?? 26;
  const lopDeduction = updates.lop_days > 0
    ? Math.round((e.gross_salary / workingDays) * updates.lop_days)
    : 0;

  // P-005 + P-003: re-derive base TDS regime-aware, then add marginal tax on bonus.
  // Idempotent on re-edit: bonus=0 collapses bonusTax to 0. Salary structure provides
  // regime + old-regime deductions; falls back to new regime if structure missing.
  const { data: salary } = await supabase
    .from("salary_structures")
    .select("tax_regime, additional_deductions_annual")
    .eq("org_id", user.orgId)
    .eq("employee_id", e.employee_id)
    .maybeSingle();
  const regime: "new" | "old" = ((salary as any)?.tax_regime as "new" | "old") ?? "new";
  const standardDeduction = regime === "old" ? 50000 : 75000;
  const extraDeductions =
    regime === "old" ? Number((salary as any)?.additional_deductions_annual ?? 0) : 0;

  // P-002: prefer the FY snapshot stored at process time; fall back to gross×12 for
  // legacy entries written before the snapshot columns existed.
  const monthsInFY: number = Number(e.months_in_fy) > 0 ? Number(e.months_in_fy) : 12;
  const annualTaxable: number =
    e.annual_taxable_income != null
      ? Number(e.annual_taxable_income)
      : Math.max(0, e.gross_salary * 12 - e.employee_pf * 12 - standardDeduction - extraDeductions);
  const baseTdsMonthly = Math.round(computeTaxByRegime(annualTaxable, regime) / monthsInFY);
  const bonusTax = computeAdditionalTaxOnBonus(annualTaxable, updates.bonus, regime);
  const adjustedTds = baseTdsMonthly + bonusTax;

  const totalDeductions = e.employee_pf + e.professional_tax + adjustedTds + lopDeduction;
  const netPay = Math.max(0, e.gross_salary + updates.bonus - totalDeductions);

  const { error } = await supabase
    .from("payroll_entries")
    .update({
      bonus: updates.bonus,
      lop_days: updates.lop_days,
      lop_deduction: lopDeduction,
      tds: adjustedTds,
      total_deductions: totalDeductions,
      net_pay: netPay,
      previous_net_pay: e.net_pay,
      edited_by: user.employeeId ?? null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  // Recompute run totals
  const { data: allEntries } = await supabase
    .from("payroll_entries")
    .select("gross_salary, total_deductions, net_pay")
    .eq("payroll_run_id", e.payroll_run_id);

  if (allEntries) {
    const totalGross = (allEntries as any[]).reduce((s, x) => s + x.gross_salary, 0);
    const totalDed = (allEntries as any[]).reduce((s, x) => s + x.total_deductions, 0);
    const totalNet = (allEntries as any[]).reduce((s, x) => s + x.net_pay, 0);
    await supabase
      .from("payroll_runs")
      .update({ total_gross: totalGross, total_deductions: totalDed, total_net: totalNet })
      .eq("id", e.payroll_run_id);
  }

  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

// ---- Employee: My Payslips ----

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
  if ((run as any)?.status === "paid") return { success: false, error: "Cannot add line items to a paid run" };

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

  await recomputeEntryFromLineItems((entry as any).id);
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
  if ((run as any)?.status === "paid") return { success: false, error: "Cannot remove line items from a paid run" };

  const { error } = await sb.from("payroll_line_items").delete().eq("id", itemId);
  if (error) return { success: false, error: error.message };

  await recomputeEntryFromLineItems((item as any).payroll_entry_id);
  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

/**
 * Recomputes a single entry's TDS, total_line_items, total_deductions, net_pay
 * after a line-item add/remove. Reuses the entry's stored
 * annual_taxable_income + months_in_fy (snapshot from processPayrollRun).
 * Updates the parent run's roll-up totals.
 */
async function recomputeEntryFromLineItems(entryId: string): Promise<void> {
  const sb = createAdminSupabase();
  const { data: entry } = await sb
    .from("payroll_entries")
    .select("id, gross_salary, employee_pf, professional_tax, lop_deduction, payroll_run_id, employee_id, annual_taxable_income, months_in_fy, net_pay, org_id")
    .eq("id", entryId)
    .single();
  if (!entry) return;
  const e = entry as any;

  const { data: items } = await sb
    .from("payroll_line_items")
    .select("amount, taxable")
    .eq("payroll_entry_id", entryId);
  const itemsArr = (items ?? []) as Array<{ amount: number; taxable: boolean }>;
  const taxableSum = itemsArr.filter((i) => i.taxable).reduce((s, i) => s + i.amount, 0);
  const totalLineItems = itemsArr.reduce((s, i) => s + i.amount, 0);

  // Regime + extra deductions for marginal-tax math
  const { data: salary } = await sb
    .from("salary_structures")
    .select("tax_regime, additional_deductions_annual")
    .eq("org_id", e.org_id)
    .eq("employee_id", e.employee_id)
    .maybeSingle();
  const regime: "new" | "old" = ((salary as any)?.tax_regime as "new" | "old") ?? "new";
  const standardDeduction = regime === "old" ? 50000 : 75000;
  const extraDed = regime === "old" ? Number((salary as any)?.additional_deductions_annual ?? 0) : 0;

  const monthsInFY: number = Number(e.months_in_fy) > 0 ? Number(e.months_in_fy) : 12;
  const annualTaxable: number =
    e.annual_taxable_income != null
      ? Number(e.annual_taxable_income)
      : Math.max(0, e.gross_salary * 12 - e.employee_pf * 12 - standardDeduction - extraDed);
  const baseTds = Math.round(computeTaxByRegime(annualTaxable, regime) / monthsInFY);
  const bonusTax = computeAdditionalTaxOnBonus(annualTaxable, taxableSum, regime);
  const adjustedTds = baseTds + bonusTax;

  const totalDeductions = e.employee_pf + e.professional_tax + adjustedTds + (e.lop_deduction ?? 0);
  const netPay = Math.max(0, e.gross_salary + totalLineItems - totalDeductions);

  await sb
    .from("payroll_entries")
    .update({
      tds: adjustedTds,
      total_line_items: totalLineItems,
      total_deductions: totalDeductions,
      net_pay: netPay,
      previous_net_pay: e.net_pay,
      edited_at: new Date().toISOString(),
    } as any)
    .eq("id", entryId);

  // Roll up run totals.
  const { data: allEntries } = await sb
    .from("payroll_entries")
    .select("gross_salary, total_deductions, net_pay, total_line_items")
    .eq("payroll_run_id", e.payroll_run_id);
  if (allEntries) {
    const totalGross = (allEntries as any[]).reduce((s, x) => s + x.gross_salary + (x.total_line_items ?? 0), 0);
    const totalDed = (allEntries as any[]).reduce((s, x) => s + x.total_deductions, 0);
    const totalNet = (allEntries as any[]).reduce((s, x) => s + x.net_pay, 0);
    await sb
      .from("payroll_runs")
      .update({ total_gross: totalGross, total_deductions: totalDed, total_net: totalNet })
      .eq("id", e.payroll_run_id);
  }
}
