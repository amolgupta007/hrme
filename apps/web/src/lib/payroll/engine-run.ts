// Payroll runs on the engine (plan §5, step 5). Plain module — NOT
// "use server" (gotcha #85): raw org ids; callers check auth/role/plan.
//
// One path for every org: orgs that set up the engine use their saved
// settings, components, rules and salary revisions; everyone else runs on the
// legacy preset with their salary_structures, which reproduces the old
// processPayrollRun exactly for months before the Sep 2026 EPF change (parity
// tests) and applies the statutory rules from then on.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePayslip,
  daysInMonth,
  legacySettings,
  type Adjustment,
  type PayslipResult,
  type StatutoryRuleKey,
} from "@jambahr/shared/payroll/engine";
import { resolvePenaltyDays, type PenaltyBand } from "@jambahr/shared/attendance/late-penalty-bands";
import { bankNameFromIfsc } from "@jambahr/shared/payroll/payslip";
import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";
import { loadCountableLates } from "@/lib/attendance/late-counting";
import { loadPayrollConfig, type PayrollConfig } from "./engine-config";
import { loadNonWorkingDates } from "./non-working-days";
import {
  effectiveRevision,
  loadRevisions,
  revisionDraftFromLegacy,
  toEmployeeInput,
  type LegacyStructure,
  type SalaryRevision,
} from "./engine-salary";

export const ENGINE_VERSION = 1;

export interface RunRow {
  id: string;
  org_id: string;
  month: string;
  status: string;
  working_days: number;
}

export interface CalculateResult {
  calculated: number;
  skipped: { employeeId: string; name: string; reason: string }[];
  excluded: { employeeId: string; name: string; reason: string | null }[];
  warnings: string[];
  totals: { gross: number; deductions: number; net: number };
}

type Emp = {
  id: string; first_name: string; last_name: string; designation: string | null; status: string;
  gender: string | null; date_of_joining: string | null; employment_type: string | null; department_id: string | null;
  pan_number: string | null; uan: string | null; pf_number: string | null; esic_number: string | null;
  work_location: string | null; payroll_excluded: boolean; payroll_excluded_reason: string | null;
  employee_code: string | null; date_of_birth: string | null; aadhar_number: string | null; pran: string | null;
  nationality: string | null;
  departments?: { name: string } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Config for a run: saved engine config, or the legacy preset at the run's typed working days. */
export async function loadRunConfig(sb: SupabaseClient, run: RunRow): Promise<PayrollConfig> {
  const config = await loadPayrollConfig(sb, run.org_id, run.month);
  if (config.source === "legacy") {
    return { ...config, settings: { ...config.settings, ...legacySettings(run.working_days) } };
  }
  return config;
}

/** Unpaid-leave days inside the month, counting the overlap of leaves that span month ends. */
async function loadUnpaidLeaveDays(sb: SupabaseClient, orgId: string, month: string): Promise<Map<string, number>> {
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const { data, error } = await sb
    .from("leave_requests")
    .select("employee_id, days, start_date, end_date, leave_policies(type)")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .lte("start_date", end)
    .gte("end_date", start);
  if (error) throw new Error(`leave_requests: ${error.message}`);
  const out = new Map<string, number>();
  for (const l of (data ?? []) as unknown as { employee_id: string; days: number; start_date: string; end_date: string; leave_policies: { type: string } | null }[]) {
    if (l.leave_policies?.type !== "unpaid") continue;
    const inside = l.start_date >= start && l.end_date <= end;
    let days = Number(l.days ?? 0);
    if (!inside) {
      const s = l.start_date < start ? start : l.start_date;
      const e = l.end_date > end ? end : l.end_date;
      days = Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000) + 1;
    }
    out.set(l.employee_id, (out.get(l.employee_id) ?? 0) + days);
  }
  return out;
}

/** Late-penalty days per employee for the month — same rules as the old run (bands or ladder). */
async function loadLatePenaltyDays(sb: SupabaseClient, orgId: string, month: string, emps: Emp[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data: policy } = await sb.from("late_policies").select("id, enabled, consequence, evaluate_from").eq("org_id", orgId).maybeSingle();
  const p = policy as { id: string; enabled: boolean; consequence: string; evaluate_from: string | null } | null;
  if (!p?.enabled) return out;

  if (p.consequence === "salary_deduction" || p.consequence === "both") {
    const { data: bandRows } = await sb.from("late_penalty_bands").select("min_late_days, max_late_days, deduction_days")
      .eq("org_id", orgId).eq("policy_id", p.id).order("sort", { ascending: true });
    const bands: PenaltyBand[] = ((bandRows ?? []) as { min_late_days: number; max_late_days: number | null; deduction_days: number | string }[])
      .map((b) => ({ min_late_days: b.min_late_days, max_late_days: b.max_late_days, deduction_days: Number(b.deduction_days) }));
    if (bands.length > 0) {
      const { data: targetRows } = await sb.from("late_policy_targets").select("target_type, target_id").eq("org_id", orgId).eq("policy_id", p.id);
      const covered = resolveCoveredEmployeeIds({
        targets: ((targetRows ?? []) as { target_type: "department" | "employee"; target_id: string }[]),
        employees: emps.map((e) => ({ id: e.id, department_id: e.department_id })),
      });
      const countable = await loadCountableLates(sb as never, { orgId, month, employeeIds: [...covered], evaluateFrom: p.evaluate_from });
      const { data: flags } = await sb.from("late_policy_flags").select("employee_id, status").eq("org_id", orgId).eq("month", month);
      const waived = new Set(((flags ?? []) as { employee_id: string; status: string }[]).filter((f) => f.status === "overridden").map((f) => f.employee_id));
      for (const [employeeId, lates] of countable) {
        if (!covered.has(employeeId) || waived.has(employeeId)) continue;
        const days = resolvePenaltyDays(lates.length, bands);
        if (days > 0) out.set(employeeId, days);
      }
    }
  }
  if (p.consequence === "leave_deduction") {
    // The ladder decides LOP days per step; it overrides any band result.
    const { data: events } = await sb.from("late_penalty_events").select("employee_id, lop_days")
      .eq("org_id", orgId).eq("month", month).eq("kind", "deduction").eq("status", "applied");
    const ladder = new Map<string, number>();
    for (const e of (events ?? []) as { employee_id: string; lop_days: number | string }[]) {
      ladder.set(e.employee_id, (ladder.get(e.employee_id) ?? 0) + Number(e.lop_days));
    }
    for (const [id, days] of ladder) if (days > 0) out.set(id, days);
  }
  return out;
}

/**
 * Calculates (or recalculates) a run's entries and writes them. Draft runs
 * only — callers enforce it. Manual entry edits (edited_at set) keep their LOP
 * and late-penalty days; line items are carried as one-off adjustments.
 * With `employeeId`, recalculates just that employee.
 */
export async function calculateRunEntries(
  sb: SupabaseClient,
  run: RunRow,
  opts: { employeeId?: string } = {},
): Promise<CalculateResult> {
  const orgId = run.org_id;
  const month = run.month;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  const config = await loadRunConfig(sb, run);
  const warnings: string[] = [];

  let empQuery = sb.from("employees")
    .select("id, first_name, last_name, designation, status, gender, date_of_joining, employment_type, department_id, pan_number, uan, pf_number, esic_number, work_location, payroll_excluded, payroll_excluded_reason, employee_code, date_of_birth, aadhar_number, pran, nationality, departments!employees_department_id_fkey(name)")
    .eq("org_id", orgId)
    .neq("status", "terminated");
  if (opts.employeeId) empQuery = empQuery.eq("id", opts.employeeId);
  const { data: empRows, error: empErr } = await empQuery;
  if (empErr) throw new Error(`employees: ${empErr.message}`);
  const allEmps = (empRows ?? []) as unknown as Emp[];

  const [revisions, legacyRes, bankRes, lop, late, existingRes, offDays] = await Promise.all([
    loadRevisions(sb, orgId, opts.employeeId),
    sb.from("salary_structures").select("employee_id, ctc, state, is_metro, include_hra, tax_regime, additional_deductions_annual, effective_from").eq("org_id", orgId),
    sb.from("employee_bank_accounts").select("employee_id, account_number_last4, ifsc_first4").eq("org_id", orgId),
    config.settings.lopSource === "unpaid_leave" ? loadUnpaidLeaveDays(sb, orgId, month) : Promise.resolve(new Map<string, number>()),
    loadLatePenaltyDays(sb, orgId, month, allEmps),
    sb.from("payroll_entries").select("id, employee_id, edited_at, lop_days, late_penalty_days").eq("payroll_run_id", run.id),
    loadNonWorkingDates(sb, { orgId, month, employees: allEmps }),
  ]);
  if (legacyRes.error) throw new Error(`salary_structures: ${legacyRes.error.message}`);
  if (existingRes.error) throw new Error(`payroll_entries: ${existingRes.error.message}`);
  if (config.settings.lopSource === "negative_leave_balance") {
    warnings.push("Unpaid days from negative leave balances aren't calculated automatically yet — enter LOP days on each entry.");
  }
  const legacy = new Map(((legacyRes.data ?? []) as (LegacyStructure & { employee_id: string; effective_from: string })[]).map((s) => [s.employee_id, s]));
  const bank = new Map(((bankRes.data ?? []) as { employee_id: string; account_number_last4: string; ifsc_first4: string | null }[]).map((b) => [b.employee_id, b]));
  const existing = new Map(((existingRes.data ?? []) as { id: string; employee_id: string; edited_at: string | null; lop_days: number; late_penalty_days: number }[]).map((e) => [e.employee_id, e]));

  // One-off adjustments already on draft entries.
  const entryIds = [...existing.values()].map((e) => e.id);
  const adjustments = new Map<string, Adjustment[]>();
  if (entryIds.length) {
    const { data: items, error } = await sb.from("payroll_line_items").select("payroll_entry_id, category, amount, taxable, note, direction, component_code").in("payroll_entry_id", entryIds);
    if (error) throw new Error(`payroll_line_items: ${error.message}`);
    const byEntry = new Map([...existing.values()].map((e) => [e.id, e.employee_id]));
    for (const it of (items ?? []) as { payroll_entry_id: string; category: string; amount: number; taxable: boolean; note: string | null; direction: "earning" | "deduction" | null; component_code: string | null }[]) {
      const emp = byEntry.get(it.payroll_entry_id)!;
      const label = it.note?.trim() || it.category.charAt(0).toUpperCase() + it.category.slice(1);
      adjustments.set(emp, [...(adjustments.get(emp) ?? []), {
        label, direction: it.direction ?? "earning", amount: Number(it.amount), taxable: it.taxable, code: it.component_code ?? undefined,
      }]);
    }
  }

  const ruleOf = new Map(config.components.map((c) => [c.code, c.rule]));
  const sumRule = (slip: PayslipResult, kind: "deduction" | "employer_contribution", rule: StatutoryRuleKey) =>
    slip.lines.filter((l) => l.kind === kind && ruleOf.get(l.code) === rule).reduce((s, l) => s + l.amount, 0);

  const result: CalculateResult = { calculated: 0, skipped: [], excluded: [], warnings, totals: { gross: 0, deductions: 0, net: 0 } };
  const rows: Record<string, unknown>[] = [];
  const keep = new Set<string>();

  for (const e of allEmps) {
    const name = `${e.first_name} ${e.last_name}`.trim();
    if (e.employment_type === "contract") continue; // paid through Contractors
    if (e.payroll_excluded) { result.excluded.push({ employeeId: e.id, name, reason: e.payroll_excluded_reason }); continue; }
    if (e.date_of_joining && e.date_of_joining > monthEnd) { result.skipped.push({ employeeId: e.id, name, reason: `Joins after ${month}` }); continue; }

    let rev: SalaryRevision | null = effectiveRevision(revisions, e.id, month);
    if (!rev && config.settings.inputMode === "ctc_first") {
      const l = legacy.get(e.id);
      if (l && l.effective_from <= monthStart) {
        rev = { id: "legacy", employeeId: e.id, effectiveFromMonth: month, monthlyGross: null, notes: null, createdAt: "", ...revisionDraftFromLegacy(l) };
      }
    }
    if (!rev) { result.skipped.push({ employeeId: e.id, name, reason: "No salary for this month" }); continue; }

    const prev = existing.get(e.id);
    const lopDays = prev?.edited_at ? Number(prev.lop_days ?? 0) : lop.get(e.id) ?? 0;
    const lateDays = prev?.edited_at ? Number(prev.late_penalty_days ?? 0) : late.get(e.id) ?? 0;
    const off = offDays.get(e.id);
    if (config.settings.prorateJoinersLeavers && !off?.hasWeekOff && e.date_of_joining && e.date_of_joining > monthStart) {
      warnings.push(`${name} joined on ${e.date_of_joining} and no week-off policy is set, so they're paid from that date. Set the week-off policy in Settings → Attendance if the days before were off.`);
    }

    let slip: PayslipResult;
    try {
      slip = computePayslip({
        settings: config.settings, components: config.components, rules: config.rules,
        employee: toEmployeeInput(rev, e),
        run: { month, lopDays, latePenaltyDays: lateDays, nonWorkingDates: off?.dates, adjustments: adjustments.get(e.id) ?? [] },
      });
    } catch (err) {
      result.skipped.push({ employeeId: e.id, name, reason: err instanceof Error ? err.message : "Can't calculate" });
      continue;
    }

    const component = (k: "earning") => slip.lines.filter((l) => l.kind === k && l.source === "component").reduce((s, l) => s + l.amount, 0);
    const componentGross = r2(component("earning"));
    const basic = slip.lines.find((l) => l.code === "BASIC")?.amount ?? 0;
    const hra = slip.lines.find((l) => l.code === "HRA")?.amount ?? 0;
    const adj = slip.lines.filter((l) => l.source === "adjustment").reduce((s, l) => s + (l.kind === "earning" ? l.amount : -l.amount), 0);
    const usedRules = Object.fromEntries(
      Object.entries(slip.ruleVersions).map(([k, v]) => [k, { ...v, params: config.rules.find((x) => x.id === v!.id)?.params }]),
    );

    rows.push({
      payroll_run_id: run.id,
      org_id: orgId,
      employee_id: e.id,
      basic_monthly: basic,
      hra_monthly: hra,
      special_allowance_monthly: r2(componentGross - basic - hra),
      gross_salary: componentGross,
      employee_pf: sumRule(slip, "deduction", "epf"),
      professional_tax: sumRule(slip, "deduction", "pt"),
      tds: sumRule(slip, "deduction", "tds"),
      lop_days: lopDays,
      lop_deduction: slip.lines.find((l) => l.code === "LOP")?.amount ?? 0,
      late_penalty_days: lateDays,
      late_penalty_deduction: slip.lines.find((l) => l.code === "LATE_PENALTY")?.amount ?? 0,
      bonus: 0,
      total_line_items: Math.round(adj),
      total_deductions: r2(slip.totalDeductions),
      net_pay: slip.netPay,
      annual_taxable_income: slip.tds?.annualTaxableIncome ?? null,
      months_in_fy: slip.tds?.monthsInFY ?? null,
      employer_contributions_total: r2(slip.employerContributions),
      ctc_monthly: r2(slip.ctcMonthly),
      days_paid: r2(slip.daysPaid),
      engine_version: ENGINE_VERSION,
      snapshot: {
        v: ENGINE_VERSION,
        month,
        employee: {
          id: e.id, name, designation: e.designation, department: e.departments?.name ?? null, gender: e.gender,
          dateOfJoining: e.date_of_joining, pan: e.pan_number, uan: e.uan, pfNumber: e.pf_number,
          esicNumber: e.esic_number, workLocation: e.work_location, bankLast4: bank.get(e.id)?.account_number_last4 ?? null,
          bankName: bankNameFromIfsc(bank.get(e.id)?.ifsc_first4), code: e.employee_code, dateOfBirth: e.date_of_birth,
          pran: e.pran, nationality: e.nationality,
          // Never the full number on a slip: last 4 digits only.
          aadhaarLast4: e.aadhar_number?.replace(/\D/g, "").slice(-4) || null,
        },
        salary: { revisionId: rev.id, effectiveFromMonth: rev.effectiveFromMonth, monthlyGross: rev.monthlyGross, annualCtc: rev.annualCtc, taxRegime: rev.taxRegime, ptState: rev.ptState },
        days: { basis: slip.basisDays, paid: slip.daysPaid, lop: lopDays, latePenalty: lateDays },
        lines: slip.lines,
        totals: { gross: slip.grossEarnings, deductions: slip.totalDeductions, employer: slip.employerContributions, net: slip.netPay, ctcMonthly: slip.ctcMonthly },
        tds: slip.tds ?? null,
        rules: usedRules,
        warnings: slip.warnings,
      },
    });
    keep.add(e.id);
    result.calculated += 1;
    result.totals.gross += slip.grossEarnings;
    result.totals.deductions += slip.totalDeductions;
    result.totals.net += slip.netPay;
    for (const w of slip.warnings) if (!warnings.includes(w)) warnings.push(w);
  }

  if (rows.length) {
    const { error } = await sb.from("payroll_entries").upsert(rows, { onConflict: "payroll_run_id,employee_id" });
    if (error) throw new Error(`payroll_entries: ${error.message}`);
  }
  // Whole-run calculation: drop entries for people who no longer qualify.
  if (!opts.employeeId) {
    const stale = [...existing.values()].filter((x) => !keep.has(x.employee_id)).map((x) => x.id);
    if (stale.length) {
      const { error } = await sb.from("payroll_entries").delete().in("id", stale);
      if (error) throw new Error(`payroll_entries: ${error.message}`);
    }
  } else if (!keep.has(opts.employeeId) && existing.get(opts.employeeId)) {
    await sb.from("payroll_entries").delete().eq("id", existing.get(opts.employeeId)!.id);
  }
  return result;
}

/** Sum of the run's current entries, for the run row. */
export async function runTotals(sb: SupabaseClient, runId: string) {
  const { data, error } = await sb.from("payroll_entries").select("gross_salary, total_line_items, total_deductions, net_pay").eq("payroll_run_id", runId);
  if (error) throw new Error(`payroll_entries: ${error.message}`);
  const rows = (data ?? []) as { gross_salary: number; total_line_items: number; total_deductions: number; net_pay: number }[];
  return {
    employee_count: rows.length,
    total_gross: r2(rows.reduce((s, r) => s + Number(r.gross_salary) + Math.max(0, Number(r.total_line_items ?? 0)), 0)),
    total_deductions: r2(rows.reduce((s, r) => s + Number(r.total_deductions), 0)),
    total_net: r2(rows.reduce((s, r) => s + Number(r.net_pay), 0)),
  };
}

/** What the run was calculated with — frozen on the run at process time. */
export async function runSnapshot(sb: SupabaseClient, run: RunRow) {
  const config = await loadRunConfig(sb, run);
  const { data: org } = await sb.from("organizations").select("name, address, gstin, pan, tan, pf_establishment_code, esi_code, logo_url, settings").eq("id", run.org_id).single();
  // Freeze only what the pay slip shows — not the whole settings blob.
  const orgSnap = org ? { ...(org as any), settings: { payslip: (org as any).settings?.payslip ?? null } } : null;
  const used = new Set<string>();
  const { data: entries } = await sb.from("payroll_entries").select("snapshot").eq("payroll_run_id", run.id);
  for (const e of (entries ?? []) as { snapshot: { rules?: Record<string, { id: string }> } | null }[]) {
    for (const v of Object.values(e.snapshot?.rules ?? {})) used.add(v.id);
  }
  return {
    settings_snapshot: {
      source: config.source,
      settings: config.settings,
      components: config.components.map((c) => ({ code: c.code, label: c.label, kind: c.kind, order: c.order, showOnPayslip: c.showOnPayslip, method: c.method, rule: c.rule ?? null })),
      org: orgSnap,
      engineVersion: ENGINE_VERSION,
    },
    rule_versions: config.rules.filter((r) => used.has(r.id)).map((r) => ({ id: r.id, scope: r.scope, ruleKey: r.ruleKey, jurisdiction: r.jurisdiction, effectiveFromMonth: r.effectiveFromMonth, params: r.params })),
  };
}
