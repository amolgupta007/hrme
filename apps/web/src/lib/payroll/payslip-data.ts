// Loading one pay slip as a PayslipDocument (+ the org logo) for any surface:
// web view, PDF download, email, mobile. Plain module — NOT "use server"
// (gotcha #85); callers check who may see which entry (canViewPayslip).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPayslipFromLegacy,
  buildPayslipFromSnapshot,
  type EntrySnapshot,
  type PayslipDocument,
  type PayslipEmployeeFieldSettings,
  type PayslipOptions,
  type PayslipOrg,
} from "@jambahr/shared/payroll/payslip";
import type { PayslipLogo } from "./payslip-pdf";

const BUCKET = "documents";

/** Org-level pay slip presentation, at organizations.settings.payslip. */
export interface PayslipSettings {
  legalName?: string | null;
  website?: string | null;
  email?: string | null;
  queryLine?: string | null;
  showEmployerContributions?: boolean;
  /** Which employee fields the slip shows, and their labels. */
  employeeFields?: PayslipEmployeeFieldSettings | null;
}

export interface LoadedPayslip {
  doc: PayslipDocument;
  logo: PayslipLogo | null;
  entryId: string;
  orgId: string;
  employeeId: string;
  month: string;
  runStatus: string;
}

interface OrgRow {
  name: string;
  address: unknown;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  pf_establishment_code: string | null;
  esi_code: string | null;
  logo_url: string | null;
  settings: { payslip?: PayslipSettings } | null;
}

export function payslipOrg(org: OrgRow): { org: PayslipOrg; options: PayslipOptions } {
  const p = org.settings?.payslip ?? {};
  return {
    org: {
      name: org.name,
      legalName: p.legalName ?? null,
      address: (org.address as PayslipOrg["address"]) ?? null,
      website: p.website ?? null,
      email: p.email ?? null,
      gstin: org.gstin,
      pan: org.pan,
      tan: org.tan,
      pf_establishment_code: org.pf_establishment_code,
      esi_code: org.esi_code,
    },
    options: {
      queryLine: p.queryLine ?? null,
      showEmployerContributions: !!p.showEmployerContributions,
      employeeFields: p.employeeFields ?? null,
    },
  };
}

/** The org's logo bytes from storage (organizations.logo_url holds the storage path). */
export async function loadOrgLogo(sb: SupabaseClient, logoPath: string | null): Promise<PayslipLogo | null> {
  if (!logoPath) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(logoPath);
  if (error || !data) return null;
  const format = /\.jpe?g$/i.test(logoPath) ? "jpg" : "png";
  return { data: Buffer.from(await data.arrayBuffer()), format };
}

/**
 * Builds the pay slip for an entry. A processed entry renders from its frozen
 * snapshot (org details frozen on the run, falling back to the live org for
 * runs processed before those were captured); a pre-engine entry renders from
 * its columns. Returns null if the entry doesn't exist in the org.
 */
export async function loadPayslip(sb: SupabaseClient, orgId: string, entryId: string): Promise<LoadedPayslip | null> {
  const { data: entry, error } = await sb
    .from("payroll_entries")
    .select(
      "id, org_id, employee_id, snapshot, basic_monthly, hra_monthly, special_allowance_monthly, bonus, employee_pf, professional_tax, tds, lop_days, lop_deduction, late_penalty_days, late_penalty_deduction, total_deductions, net_pay, run:payroll_runs!payroll_run_id(month, status, paid_at, settings_snapshot), employee:employees!employee_id(first_name, last_name, designation, departments!employees_department_id_fkey(name))",
    )
    .eq("id", entryId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`payroll_entries: ${error.message}`);
  if (!entry) return null;
  const e = entry as any;
  if (e.org_id !== orgId) return null; // belt and braces over the query filter
  const run = e.run as { month: string; status: string; paid_at: string | null; settings_snapshot: { org?: Partial<OrgRow> | null } | null };

  const { data: liveOrg, error: orgErr } = await sb
    .from("organizations")
    .select("name, address, gstin, pan, tan, pf_establishment_code, esi_code, logo_url, settings")
    .eq("id", orgId)
    .single();
  if (orgErr) throw new Error(`organizations: ${orgErr.message}`);
  // Prefer what was frozen on the run; fill anything it didn't capture from the live org.
  const frozen = run.settings_snapshot?.org ?? {};
  const org = { ...(liveOrg as OrgRow), ...Object.fromEntries(Object.entries(frozen).filter(([, v]) => v !== undefined)) } as OrgRow;
  const { org: slipOrg, options } = payslipOrg(org);
  const payment = { paidAt: run.status === "paid" ? run.paid_at : null };

  let doc: PayslipDocument;
  if (e.snapshot) {
    doc = buildPayslipFromSnapshot(e.snapshot as EntrySnapshot, slipOrg, options, payment);
  } else {
    const { data: items } = await sb.from("payroll_line_items").select("category, note, amount, direction").eq("payroll_entry_id", entryId);
    const emp = e.employee ?? {};
    doc = buildPayslipFromLegacy(
      {
        employeeName: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Employee",
        designation: emp.designation ?? null,
        department: emp.departments?.name ?? null,
        basic: Number(e.basic_monthly), hra: Number(e.hra_monthly), special: Number(e.special_allowance_monthly), bonus: Number(e.bonus ?? 0),
        employeePf: Number(e.employee_pf), professionalTax: Number(e.professional_tax), tds: Number(e.tds),
        lopDays: Number(e.lop_days ?? 0), lopDeduction: Number(e.lop_deduction ?? 0),
        latePenaltyDays: Number(e.late_penalty_days ?? 0), latePenaltyDeduction: Number(e.late_penalty_deduction ?? 0),
        lineItems: ((items ?? []) as { category: string; note: string | null; amount: number; direction: string | null }[])
          .filter((i) => i.direction !== "deduction")
          .map((i) => ({ label: i.note?.trim() || i.category.charAt(0).toUpperCase() + i.category.slice(1), amount: Number(i.amount) })),
        totalDeductions: Number(e.total_deductions), netPay: Number(e.net_pay),
      },
      run.month, slipOrg, options, payment,
    );
  }

  return {
    doc,
    logo: await loadOrgLogo(sb, org.logo_url),
    entryId,
    orgId,
    employeeId: e.employee_id,
    month: run.month,
    runStatus: run.status,
  };
}

/** Admins see any slip in their org; others only their own, and never a draft. */
export function canViewPayslip(
  viewer: { isAdmin: boolean; employeeId: string | null },
  slip: { employeeId: string; runStatus: string },
): boolean {
  if (viewer.isAdmin) return true;
  return !!viewer.employeeId && viewer.employeeId === slip.employeeId && slip.runStatus !== "draft";
}
