"use server";

// Payroll → Salary structures, for orgs on the payroll engine (plan §3, step 4):
// dated salary revisions per employee (monthly gross or annual CTC, plus that
// employee's own component values), and the "not on this company's payroll"
// flag (D9). Admin-only, Business-plan gated, every change in payroll_audit_log.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { computePayslip, currentPayMonthIST, isPayMonth } from "@jambahr/shared/payroll/engine";
import { loadPayrollConfig, writePayrollAudit, type PayrollConfig } from "@/lib/payroll/engine-config";
import {
  effectiveRevision,
  loadRevisions,
  revisionDraftFromLegacy,
  syncLegacyStructure,
  toEmployeeInput,
  type LegacyStructure,
  type PayrollPerson,
  type SalaryRevision,
} from "@/lib/payroll/engine-salary";
import type { ActionResult } from "@/types";

const PAYROLL_PATH = "/dashboard/payroll";

async function requirePayrollAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" } as const;
  if (!isAdmin(user.role)) return { error: "Only admins can manage salaries" } as const;
  if (!hasFeature(user.plan ?? "starter", "payroll", user.customFeatures ?? null)) {
    return { error: "Payroll is available on the Business plan" } as const;
  }
  return { user } as const;
}

export interface SalaryEmployee extends PayrollPerson {
  firstName: string;
  lastName: string;
  designation: string | null;
  status: string;
  payrollExcluded: boolean;
  payrollExcludedReason: string | null;
  /** Shown on the pay slip. */
  uan: string | null;
  pfNumber: string | null;
  esicNumber: string | null;
  workLocation: string | null;
  /** Their pre-engine salary_structures row, to start a first revision from. */
  legacyDraft: ReturnType<typeof revisionDraftFromLegacy> | null;
}

export interface SalaryEditorView {
  month: string;
  config: PayrollConfig;
  employees: SalaryEmployee[];
  revisions: SalaryRevision[];
}

/** Everything the Salary structures tab needs, as of a pay month (default: this month, IST). */
export async function getSalaryEditorView(forMonth?: string): Promise<ActionResult<SalaryEditorView>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const month = forMonth && isPayMonth(forMonth) ? forMonth : currentPayMonthIST();
  const { orgId } = auth.user;
  const sb = createAdminSupabase();
  try {
    const [config, revisions, empRes, legacyRes] = await Promise.all([
      loadPayrollConfig(sb, orgId, month),
      loadRevisions(sb, orgId),
      sb.from("employees")
        .select("id, first_name, last_name, designation, status, gender, date_of_joining, payroll_excluded, payroll_excluded_reason, employment_type, uan, pf_number, esic_number, work_location")
        .eq("org_id", orgId)
        .neq("status", "terminated")
        .order("first_name"),
      sb.from("salary_structures")
        .select("employee_id, ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual")
        .eq("org_id", orgId),
    ]);
    if (empRes.error) return { success: false, error: empRes.error.message };
    if (legacyRes.error) return { success: false, error: legacyRes.error.message };
    const legacy = new Map(
      ((legacyRes.data ?? []) as (LegacyStructure & { employee_id: string })[]).map((s) => [s.employee_id, s]),
    );
    type EmpRow = {
      id: string; first_name: string; last_name: string; designation: string | null; status: string;
      gender: string | null; date_of_joining: string | null; payroll_excluded: boolean;
      payroll_excluded_reason: string | null; employment_type: string | null;
      uan: string | null; pf_number: string | null; esic_number: string | null; work_location: string | null;
    };
    const employees: SalaryEmployee[] = ((empRes.data ?? []) as EmpRow[])
      // Contractors are paid through the contractor flow, never a salary run.
      .filter((e) => e.employment_type !== "contract")
      .map((e) => {
        const l = legacy.get(e.id);
        return {
          id: e.id, firstName: e.first_name, lastName: e.last_name, designation: e.designation, status: e.status,
          gender: e.gender, date_of_joining: e.date_of_joining,
          payrollExcluded: !!e.payroll_excluded, payrollExcludedReason: e.payroll_excluded_reason,
          uan: e.uan, pfNumber: e.pf_number, esicNumber: e.esic_number, workLocation: e.work_location,
          legacyDraft: l ? revisionDraftFromLegacy(l) : null,
        };
      });
    return { success: true, data: { month, config, employees, revisions } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not load salaries" };
  }
}

// ── Save a revision ─────────────────────────────────────────────────────────

const OverrideSchema = z
  .object({ amount: z.number().min(0).max(100_000_000).optional(), pct: z.number().min(0).max(100).optional() })
  .refine((o) => o.amount !== undefined || o.pct !== undefined, "Empty override");

const RevisionSchema = z.object({
  employeeId: z.string().uuid(),
  effectiveFromMonth: z.string().refine(isPayMonth, "Pick a month (YYYY-MM)"),
  monthlyGross: z.number().min(0).max(100_000_000).nullable(),
  annualCtc: z.number().min(0).max(1_000_000_000).nullable(),
  taxRegime: z.enum(["new", "old"]),
  declaredDeductionsAnnual: z.number().min(0).max(100_000_000),
  ptState: z.string().trim().toLowerCase().max(60).nullable(),
  notes: z.string().trim().max(500).optional(),
  overrides: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/), OverrideSchema),
  reason: z.string().trim().max(500).optional(),
});

export type SalaryRevisionInput = z.infer<typeof RevisionSchema>;

const comparable = (r: Pick<SalaryRevision, "monthlyGross" | "annualCtc" | "taxRegime" | "declaredDeductionsAnnual" | "ptState" | "overrides">) => ({
  monthlyGross: r.monthlyGross, annualCtc: r.annualCtc, taxRegime: r.taxRegime,
  declaredDeductionsAnnual: r.declaredDeductionsAnnual, ptState: r.ptState,
  overrides: Object.fromEntries(Object.entries(r.overrides).sort(([a], [b]) => a.localeCompare(b))),
});

export async function saveSalaryRevision(input: SalaryRevisionInput): Promise<ActionResult<{ warnings: string[] }>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = RevisionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const r = parsed.data;
  const { orgId, employeeId: actorId } = auth.user;
  const sb = createAdminSupabase();

  const { data: emp, error: empErr } = await sb.from("employees")
    .select("id, gender, date_of_joining, status, employment_type").eq("id", r.employeeId).eq("org_id", orgId).maybeSingle();
  if (empErr) return { success: false, error: empErr.message };
  if (!emp) return { success: false, error: "Employee not found in your organisation" };
  const person = emp as PayrollPerson & { status: string; employment_type: string | null };
  if (person.employment_type === "contract") return { success: false, error: "Contractors are paid through Contractors, not salary" };

  let config: PayrollConfig;
  let existing: SalaryRevision[];
  try {
    [config, existing] = await Promise.all([loadPayrollConfig(sb, orgId, r.effectiveFromMonth), loadRevisions(sb, orgId, r.employeeId)]);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not load payroll settings" };
  }
  if (config.source !== "saved") {
    return { success: false, error: "Set up payroll in Settings → Payroll before adding salaries here" };
  }

  // The amount that matters depends on how this org enters salaries for that month.
  const grossMode = config.settings.inputMode === "gross_first";
  if (grossMode && !r.monthlyGross) return { success: false, error: "Enter the monthly salary (gross)" };
  if (!grossMode && !r.annualCtc) return { success: false, error: "Enter the annual CTC" };
  const overrides: SalaryRevision["overrides"] = {};
  const known = new Set(config.components.map((c) => c.code));
  for (const [code, o] of Object.entries(r.overrides)) {
    if (!known.has(code)) return { success: false, error: `Unknown component ${code}` };
    overrides[code] = o;
  }

  const draft: SalaryRevision = {
    id: "", employeeId: r.employeeId, effectiveFromMonth: r.effectiveFromMonth,
    monthlyGross: grossMode ? r.monthlyGross : null, annualCtc: grossMode ? null : r.annualCtc,
    taxRegime: r.taxRegime, declaredDeductionsAnnual: r.declaredDeductionsAnnual,
    ptState: r.ptState || null, notes: r.notes || null, createdAt: "", overrides,
  };

  // Prove it calculates before saving it.
  let warnings: string[];
  try {
    const slip = computePayslip({
      settings: config.settings, components: config.components, rules: config.rules,
      employee: { ...toEmployeeInput(draft, person), dateOfJoining: null, dateOfLeaving: null },
      run: { month: r.effectiveFromMonth },
    });
    warnings = slip.warnings;
    const balancing = slip.lines.find((l) => config.components.some((c) => c.code === l.code && c.method === "balancing"));
    if (grossMode && balancing && balancing.amount === 0 && slip.grossEarnings > draft.monthlyGross! + 1) {
      return { success: false, error: "The fixed components add up to more than the monthly salary — lower them or raise the salary" };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? `This salary can't be calculated: ${e.message}` : "This salary can't be calculated" };
  }

  const prev = existing.find((x) => x.effectiveFromMonth === r.effectiveFromMonth) ?? null;
  const before = effectiveRevision(existing, r.employeeId, r.effectiveFromMonth);

  const { data: saved, error } = await sb.from("employee_salary_revisions").upsert(
    {
      org_id: orgId, employee_id: r.employeeId, effective_from_month: r.effectiveFromMonth,
      monthly_gross: draft.monthlyGross, annual_ctc: draft.annualCtc, tax_regime: draft.taxRegime,
      declared_deductions_annual: draft.declaredDeductionsAnnual, pt_state: draft.ptState, notes: draft.notes,
      created_by: actorId ?? null,
    },
    { onConflict: "employee_id,effective_from_month" },
  ).select("id").single();
  if (error) return { success: false, error: error.message };
  const revisionId = (saved as { id: string }).id;

  // Replace this revision's component values with exactly what was submitted.
  const { error: delErr } = await sb.from("employee_salary_component_values").delete().eq("revision_id", revisionId).eq("org_id", orgId);
  if (delErr) return { success: false, error: delErr.message };
  const values = Object.entries(overrides).map(([code, o]) => ({
    org_id: orgId, revision_id: revisionId, component_code: code, amount: o.amount ?? null, pct: o.pct ?? null,
  }));
  if (values.length) {
    const { error: vErr } = await sb.from("employee_salary_component_values").insert(values);
    if (vErr) return { success: false, error: vErr.message };
  }

  const auditErr = await writePayrollAudit(sb, orgId, actorId ?? null, [{
    entity: "salary_revision", entityId: revisionId, action: prev ? "update" : "create",
    field: `${r.employeeId}@${r.effectiveFromMonth}`,
    oldValue: (prev ?? before) ? comparable((prev ?? before)!) : null,
    newValue: comparable(draft), reason: r.reason || null,
  }]);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };

  // Keep the pre-engine table current for its remaining readers.
  const now = currentPayMonthIST();
  if (r.effectiveFromMonth <= now) {
    try {
      const all = await loadRevisions(sb, orgId, r.employeeId);
      const current = effectiveRevision(all, r.employeeId, now);
      if (current && current.effectiveFromMonth === r.effectiveFromMonth) {
        const nowConfig = await loadPayrollConfig(sb, orgId, now);
        const syncErr = await syncLegacyStructure(sb, orgId, person, current, nowConfig, now);
        if (syncErr) warnings = [...warnings, `Saved; the summary used by other screens didn't update (${syncErr})`];
      }
    } catch (e) {
      warnings = [...warnings, `Saved; the summary used by other screens didn't update (${e instanceof Error ? e.message : "unknown"})`];
    }
  }

  revalidatePath(PAYROLL_PATH);
  return { success: true, data: { warnings } };
}

// ── Remove a revision (only one no processed month depends on) ──────────────

export async function deleteSalaryRevision(input: { revisionId: string; reason?: string }): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const id = z.string().uuid().safeParse(input.revisionId);
  if (!id.success) return { success: false, error: "Unknown salary revision" };
  const { orgId, employeeId: actorId } = auth.user;
  const sb = createAdminSupabase();

  const { data: rev, error: findErr } = await sb.from("employee_salary_revisions").select("id, employee_id, effective_from_month, monthly_gross, annual_ctc")
    .eq("id", id.data).eq("org_id", orgId).maybeSingle();
  if (findErr) return { success: false, error: findErr.message };
  if (!rev) return { success: false, error: "Salary revision not found" };
  const row = rev as { id: string; employee_id: string; effective_from_month: string; monthly_gross: number | null; annual_ctc: number | null };

  const { data: locked, error: runErr } = await sb.from("payroll_runs").select("month")
    .eq("org_id", orgId).gte("month", row.effective_from_month).neq("status", "draft").limit(1);
  if (runErr) return { success: false, error: runErr.message };
  if ((locked ?? []).length > 0) {
    return { success: false, error: `Payroll for ${(locked as { month: string }[])[0].month} has been processed with this salary — add a new revision instead` };
  }

  const { error } = await sb.from("employee_salary_revisions").delete().eq("id", row.id).eq("org_id", orgId);
  if (error) return { success: false, error: error.message };
  const auditErr = await writePayrollAudit(sb, orgId, actorId ?? null, [{
    entity: "salary_revision", entityId: row.id, action: "delete", field: `${row.employee_id}@${row.effective_from_month}`,
    oldValue: { monthlyGross: row.monthly_gross, annualCtc: row.annual_ctc }, reason: input.reason?.trim() || null,
  }]);
  if (auditErr) return { success: false, error: `Removed, but the change could not be logged: ${auditErr}` };

  // Keep the pre-engine summary honest: re-derive it from whatever revision is
  // now in force, or drop it if no salary remains.
  const now = currentPayMonthIST();
  try {
    const remaining = await loadRevisions(sb, orgId, row.employee_id);
    const current = effectiveRevision(remaining, row.employee_id, now);
    if (current) {
      const { data: emp } = await sb.from("employees").select("id, gender, date_of_joining").eq("id", row.employee_id).eq("org_id", orgId).single();
      const nowConfig = await loadPayrollConfig(sb, orgId, now);
      await syncLegacyStructure(sb, orgId, emp as PayrollPerson, current, nowConfig, now);
    } else if (remaining.length === 0) {
      await sb.from("salary_structures").delete().eq("org_id", orgId).eq("employee_id", row.employee_id);
    }
  } catch {
    // The revision is gone and logged; the summary refreshes on the next save.
  }
  revalidatePath(PAYROLL_PATH);
  return { success: true, data: undefined };
}

// ── Not on this company's payroll (D9) ──────────────────────────────────────

export async function setPayrollExclusion(input: { employeeId: string; excluded: boolean; reason?: string }): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = z.object({
    employeeId: z.string().uuid(), excluded: z.boolean(), reason: z.string().trim().max(300).optional(),
  }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const { employeeId, excluded, reason } = parsed.data;
  if (excluded && !reason) return { success: false, error: "Say why (e.g. \"On the payroll of another group company\")" };
  const { orgId, employeeId: actorId } = auth.user;
  const sb = createAdminSupabase();

  const { data: emp, error: findErr } = await sb.from("employees").select("id, payroll_excluded, payroll_excluded_reason")
    .eq("id", employeeId).eq("org_id", orgId).maybeSingle();
  if (findErr) return { success: false, error: findErr.message };
  if (!emp) return { success: false, error: "Employee not found in your organisation" };
  const before = emp as { payroll_excluded: boolean; payroll_excluded_reason: string | null };

  const { error } = await sb.from("employees")
    .update({ payroll_excluded: excluded, payroll_excluded_reason: excluded ? reason! : null })
    .eq("id", employeeId).eq("org_id", orgId);
  if (error) return { success: false, error: error.message };
  const auditErr = await writePayrollAudit(sb, orgId, actorId ?? null, [{
    entity: "employee_payroll_exclusion", entityId: employeeId, action: "update", field: "payroll_excluded",
    oldValue: { excluded: before.payroll_excluded, reason: before.payroll_excluded_reason },
    newValue: { excluded, reason: excluded ? reason : null }, reason: reason || null,
  }]);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath(PAYROLL_PATH);
  return { success: true, data: undefined };
}

// ── Pay slip ids on the employee (UAN, PF no., ESIC no., work location) ────

const IdsSchema = z.object({
  employeeId: z.string().uuid(),
  uan: z.union([z.literal(""), z.string().trim().regex(/^\d{12}$/, "UAN is 12 digits")]),
  pfNumber: z.string().trim().max(30),
  esicNumber: z.union([z.literal(""), z.string().trim().regex(/^\d{10,17}$/, "ESIC number is 10–17 digits")]),
  workLocation: z.string().trim().max(60),
});

export async function savePayslipIds(input: z.input<typeof IdsSchema>): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = IdsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const d = parsed.data;
  const { orgId, employeeId: actorId } = auth.user;
  const sb = createAdminSupabase();
  const { data: before, error: findErr } = await sb.from("employees").select("uan, pf_number, esic_number, work_location")
    .eq("id", d.employeeId).eq("org_id", orgId).maybeSingle();
  if (findErr) return { success: false, error: findErr.message };
  if (!before) return { success: false, error: "Employee not found in your organisation" };
  const after = { uan: d.uan || null, pf_number: d.pfNumber || null, esic_number: d.esicNumber || null, work_location: d.workLocation || null };
  const { error } = await sb.from("employees").update(after).eq("id", d.employeeId).eq("org_id", orgId);
  if (error) return { success: false, error: error.message };
  const auditErr = await writePayrollAudit(sb, orgId, actorId ?? null, [{
    entity: "salary_revision", entityId: d.employeeId, action: "update", field: "payslip_ids", oldValue: before, newValue: after,
  }]);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath(PAYROLL_PATH);
  return { success: true, data: undefined };
}
