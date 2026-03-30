"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { computeCTCBreakdown, getProfessionalTax } from "@/lib/ctc";
import type { ActionResult } from "@/types";

// ---- Types ----

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
  effective_from: string;
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
  effective_from: z.string(),
});

const PayrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  working_days: z.number().int().min(1).max(31).default(26),
  notes: z.string().optional(),
});

// ---- Salary Structures ----

export async function getSalaryStructures(): Promise<ActionResult<SalaryStructureRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("salary_structures")
    .select(`
      id, employee_id, ctc, basic_monthly, hra_monthly,
      special_allowance_monthly, gross_monthly, employee_pf_monthly,
      professional_tax_monthly, tds_monthly, net_monthly,
      state, is_metro, effective_from,
      employees!employee_id(first_name, last_name, designation, departments(name))
    `)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows: SalaryStructureRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: `${r.employees.first_name} ${r.employees.last_name}`,
    department: r.employees.departments?.name ?? null,
    designation: r.employees.designation ?? null,
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
    effective_from: r.effective_from,
  }));

  return { success: true, data: rows };
}

export async function upsertSalaryStructure(
  input: z.infer<typeof SalaryStructureSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure salaries" };

  const parsed = SalaryStructureSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const { employee_id, ctc, state, is_metro, effective_from } = parsed.data;
  const breakdown = computeCTCBreakdown(ctc, state, is_metro);

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
        effective_from,
        updated_at: new Date().toISOString(),
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

// ---- Payroll Runs ----

export async function getPayrollRuns(): Promise<ActionResult<PayrollRun[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

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

  // Fetch salary structures for org
  const { data: salaries, error: salaryError } = await supabase
    .from("salary_structures")
    .select(`
      employee_id, gross_monthly, basic_monthly, hra_monthly,
      special_allowance_monthly, employee_pf_monthly,
      professional_tax_monthly, tds_monthly, net_monthly, state
    `)
    .eq("org_id", user.orgId);

  if (salaryError) return { success: false, error: salaryError.message };
  if (!salaries || salaries.length === 0) {
    return { success: false, error: "No salary structures configured. Add salaries for employees first." };
  }

  // Fetch approved leaves for the month to calculate LOP
  const [year, monthNum] = runData.month.split("-");
  const monthStart = `${year}-${monthNum}-01`;
  const monthEnd = new Date(parseInt(year), parseInt(monthNum), 0)
    .toISOString()
    .split("T")[0];

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

  // Build entries
  const entries = (salaries as any[]).map((s) => {
    const lopDays = lopMap[s.employee_id] ?? 0;
    const lopDeduction = lopDays > 0
      ? Math.round((s.gross_monthly / runData.working_days) * lopDays)
      : 0;
    const totalDeductions = s.employee_pf_monthly + s.professional_tax_monthly + s.tds_monthly + lopDeduction;
    const netPay = Math.max(0, s.gross_monthly - totalDeductions);

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
      tds: s.tds_monthly,
      lop_days: lopDays,
      lop_deduction: lopDeduction,
      bonus: 0,
      total_deductions: totalDeductions,
      net_pay: netPay,
    };
  });

  // Delete existing entries if reprocessing
  await supabase.from("payroll_entries").delete().eq("payroll_run_id", runId);

  const { error: entryError } = await supabase.from("payroll_entries").insert(entries);
  if (entryError) return { success: false, error: entryError.message };

  const totalGross = entries.reduce((s, e) => s + e.gross_salary, 0);
  const totalDeductions = entries.reduce((s, e) => s + e.total_deductions, 0);
  const totalNet = entries.reduce((s, e) => s + e.net_pay, 0);

  await supabase
    .from("payroll_runs")
    .update({
      status: "processed",
      total_gross: Math.round(totalGross),
      total_deductions: Math.round(totalDeductions),
      total_net: Math.round(totalNet),
      employee_count: entries.length,
      processed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  revalidatePath("/dashboard/payroll");
  return { success: true, data: undefined };
}

export async function markPayrollPaid(runId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can mark payroll as paid" };

  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("payroll_runs")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .eq("status", "processed");

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/payroll");
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

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("payroll_entries")
    .select(`
      id, employee_id, basic_monthly, hra_monthly, special_allowance_monthly,
      gross_salary, employee_pf, professional_tax, tds,
      lop_days, lop_deduction, bonus, total_deductions, net_pay,
      employees!employee_id(first_name, last_name, departments(name))
    `)
    .eq("payroll_run_id", runId)
    .eq("org_id", user.orgId)
    .order("created_at");

  if (error) return { success: false, error: error.message };

  const rows: PayrollEntry[] = (data ?? []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: `${r.employees.first_name} ${r.employees.last_name}`,
    department: r.employees.departments?.name ?? null,
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

  // Fetch current entry
  const { data: entry, error: fetchErr } = await supabase
    .from("payroll_entries")
    .select("gross_salary, employee_pf, professional_tax, tds, payroll_run_id")
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
  const totalDeductions = e.employee_pf + e.professional_tax + e.tds + lopDeduction;
  const netPay = Math.max(0, e.gross_salary + updates.bonus - totalDeductions);

  const { error } = await supabase
    .from("payroll_entries")
    .update({
      bonus: updates.bonus,
      lop_days: updates.lop_days,
      lop_deduction: lopDeduction,
      total_deductions: totalDeductions,
      net_pay: netPay,
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

  return { success: true, data: rows };
}
