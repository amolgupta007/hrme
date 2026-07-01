// src/lib/payroll/recompute-entry.ts
//
// Internal helper — recomputes a single payroll entry's TDS, total_line_items,
// total_deductions, net_pay after any line-item change, then rolls up the
// parent run's totals. Reuses the entry's stored annual_taxable_income +
// months_in_fy snapshot from processPayrollRun (legacy entries with NULL
// snapshots fall back to a gross×12 derivation).
//
// Intentionally lives outside any "use server" file so it can be imported
// from multiple server-action modules (currently src/actions/payroll.ts and
// src/actions/overtime.ts) without re-exposing a callable server entrypoint.
// This module trusts its caller — there is no auth/role check inside.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/server";
import { computeTaxByRegime, computeAdditionalTaxOnBonus } from "@/lib/ctc";

export async function recomputeEntryFromLineItems(
  entryId: string,
  client?: SupabaseClient,
): Promise<void> {
  const sb = client ?? createAdminSupabase();
  const { data: entry } = await sb
    .from("payroll_entries")
    .select(
      "id, gross_salary, employee_pf, professional_tax, lop_deduction, late_penalty_deduction, payroll_run_id, employee_id, annual_taxable_income, months_in_fy, net_pay, org_id",
    )
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

  // Late-penalty deduction is stored on the entry (set at process time or via a
  // manual edit); it reduces net pay only and is preserved across line-item recomputes.
  const totalDeductions =
    e.employee_pf +
    e.professional_tax +
    adjustedTds +
    (e.lop_deduction ?? 0) +
    (e.late_penalty_deduction ?? 0);
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
    const totalGross = (allEntries as any[]).reduce(
      (s, x) => s + x.gross_salary + (x.total_line_items ?? 0),
      0,
    );
    const totalDed = (allEntries as any[]).reduce((s, x) => s + x.total_deductions, 0);
    const totalNet = (allEntries as any[]).reduce((s, x) => s + x.net_pay, 0);
    await sb
      .from("payroll_runs")
      .update({ total_gross: totalGross, total_deductions: totalDed, total_net: totalNet })
      .eq("id", e.payroll_run_id);
  }
}
