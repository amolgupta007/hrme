// Per-employee salary revisions for the payroll engine (plan §3). Plain
// module — NOT "use server" (gotcha #85): raw org ids, called only from
// server actions that have already checked auth, role and plan.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePayslip,
  legacyEmployeeOverrides,
  pickEffective,
  projectAnnualCtc,
  type EmployeePayInput,
  type PayMonth,
} from "@jambahr/shared/payroll/engine";
import type { PayrollConfig } from "./engine-config";

export interface SalaryRevision {
  id: string;
  employeeId: string;
  effectiveFromMonth: PayMonth;
  monthlyGross: number | null;
  annualCtc: number | null;
  taxRegime: "new" | "old";
  declaredDeductionsAnnual: number;
  ptState: string | null;
  notes: string | null;
  createdAt: string;
  /** Per-employee overrides of component defaults, by code. */
  overrides: Record<string, { amount?: number; pct?: number }>;
}

interface RevisionRow {
  id: string;
  employee_id: string;
  effective_from_month: string;
  monthly_gross: number | string | null;
  annual_ctc: number | string | null;
  tax_regime: "new" | "old";
  declared_deductions_annual: number | string;
  pt_state: string | null;
  notes: string | null;
  created_at: string;
  employee_salary_component_values?: { component_code: string; amount: number | string | null; pct: number | string | null }[];
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

function fromRow(r: RevisionRow): SalaryRevision {
  const overrides: SalaryRevision["overrides"] = {};
  for (const v of r.employee_salary_component_values ?? []) {
    overrides[v.component_code] = {
      ...(v.amount !== null ? { amount: Number(v.amount) } : {}),
      ...(v.pct !== null ? { pct: Number(v.pct) } : {}),
    };
  }
  return {
    id: r.id,
    employeeId: r.employee_id,
    effectiveFromMonth: r.effective_from_month,
    monthlyGross: num(r.monthly_gross),
    annualCtc: num(r.annual_ctc),
    taxRegime: r.tax_regime,
    declaredDeductionsAnnual: Number(r.declared_deductions_annual ?? 0),
    ptState: r.pt_state,
    notes: r.notes,
    createdAt: r.created_at,
    overrides,
  };
}

/** Every revision in the org (optionally one employee), oldest month first. Throws on a failed read. */
export async function loadRevisions(sb: SupabaseClient, orgId: string, employeeId?: string): Promise<SalaryRevision[]> {
  let q = sb
    .from("employee_salary_revisions")
    .select("*, employee_salary_component_values(component_code, amount, pct)")
    .eq("org_id", orgId)
    .order("effective_from_month", { ascending: true });
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) throw new Error(`employee_salary_revisions: ${error.message}`);
  return ((data ?? []) as RevisionRow[]).map(fromRow);
}

export function effectiveRevision(revisions: SalaryRevision[], employeeId: string, month: PayMonth): SalaryRevision | null {
  return pickEffective(revisions.filter((r) => r.employeeId === employeeId), month);
}

export interface PayrollPerson {
  id: string;
  gender: string | null;
  date_of_joining: string | null;
  date_of_leaving?: string | null;
}

export function toEmployeeInput(rev: SalaryRevision, person: PayrollPerson): EmployeePayInput {
  return {
    employeeId: person.id,
    gender: person.gender,
    state: rev.ptState,
    taxRegime: rev.taxRegime,
    declaredDeductionsAnnual: rev.declaredDeductionsAnnual,
    monthlyGross: rev.monthlyGross ?? undefined,
    annualCtc: rev.annualCtc ?? undefined,
    overrides: rev.overrides,
    dateOfJoining: person.date_of_joining,
    dateOfLeaving: person.date_of_leaving ?? null,
  };
}

/** A legacy salary_structures row, read as the starting point for an employee's first revision. */
export interface LegacyStructure {
  ctc: number;
  state: string | null;
  is_metro: boolean;
  include_hra: boolean;
  tax_regime: "new" | "old" | null;
  additional_deductions_annual: number | null;
}

export function revisionDraftFromLegacy(s: LegacyStructure) {
  return {
    annualCtc: Number(s.ctc),
    taxRegime: (s.tax_regime ?? "new") as "new" | "old",
    declaredDeductionsAnnual: Number(s.additional_deductions_annual ?? 0),
    ptState: s.state ? s.state.trim().toLowerCase() : null,
    overrides: legacyEmployeeOverrides({ is_metro: s.is_metro, include_hra: s.include_hra }) as SalaryRevision["overrides"],
  };
}

/**
 * Keeps salary_structures (the pre-engine table) in step with the engine for
 * the readers that still use it — insights, late-penalty salary bands,
 * document variables, My Compensation and the legacy run path — until runs
 * move onto the engine (step 5). Written from the CURRENT month's calculation.
 */
export async function syncLegacyStructure(
  sb: SupabaseClient,
  orgId: string,
  person: PayrollPerson,
  rev: SalaryRevision,
  config: PayrollConfig,
  month: PayMonth,
): Promise<string | null> {
  const employee = { ...toEmployeeInput(rev, person), dateOfJoining: null, dateOfLeaving: null };
  const slip = computePayslip({ settings: config.settings, components: config.components, rules: config.rules, employee, run: { month } });
  const line = (code: string) => slip.lines.find((l) => l.code === code)?.amount ?? 0;
  const basic = line("BASIC");
  const hra = line("HRA");
  const annualCtc =
    rev.annualCtc ?? projectAnnualCtc({ settings: config.settings, components: config.components, rules: config.rules, employee, month });
  const pfEe = slip.lines.find((l) => l.kind === "deduction" && l.code === "EPF_EE")?.amount ?? 0;
  const pfEr = slip.lines.find((l) => l.kind === "employer_contribution" && l.code === "EPF_ER")?.amount ?? 0;
  const [y, m] = rev.effectiveFromMonth.split("-");
  const { error } = await sb.from("salary_structures").upsert(
    {
      org_id: orgId,
      employee_id: person.id,
      ctc: Math.round(annualCtc),
      basic_monthly: basic,
      hra_monthly: hra,
      // Everything else in gross (LTA, conveyance, special…) so the legacy columns still add up.
      special_allowance_monthly: Math.round(slip.grossEarnings - basic - hra),
      gross_monthly: slip.grossEarnings,
      employer_pf_monthly: pfEr,
      employer_gratuity_annual: Math.round(line("GRATUITY") * 12),
      employee_pf_monthly: pfEe,
      professional_tax_monthly: line("PT"),
      tds_monthly: line("TDS"),
      net_monthly: slip.netPay,
      state: rev.ptState ?? "other",
      include_hra: basic > 0 ? hra > 0 : true,
      effective_from: `${y}-${m}-01`,
      tax_regime: rev.taxRegime,
      additional_deductions_annual: rev.declaredDeductionsAnnual,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,employee_id" },
  );
  return error ? error.message : null;
}
