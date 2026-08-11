import type {
  MobilePayslipDetail,
  MobilePayslipLineItem,
  MobilePayslipListItem,
} from "@jambahr/shared";

/**
 * Pure shapers for the mobile payslip endpoints. No I/O — the route fetches the
 * rows (org + employee scoped) and hands them here. Unit-tested for
 * draft-exclusion, month-desc ordering, and detail composition.
 */

/** A `payroll_entries` row joined to its run, as the list route selects it. */
export type PayslipEntryRow = {
  id: string;
  net_pay: number | string;
  run: {
    id: string;
    month: string;
    status: string; // draft | processed | paid
    paid_at: string | null;
  } | null;
};

/**
 * The list payload: one item per NON-draft entry, month-descending. Entries
 * whose run is a draft (admin still editing) or has no joined run are dropped.
 */
export function buildPayslipList(rows: PayslipEntryRow[]): MobilePayslipListItem[] {
  return rows
    .filter((r) => r.run && r.run.status !== "draft")
    .map((r) => ({
      entryId: r.id,
      runId: r.run!.id,
      month: r.run!.month,
      status: r.run!.status as MobilePayslipListItem["status"],
      paidAt: r.run!.paid_at ?? null,
      netPay: Number(r.net_pay),
    }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

/** A full `payroll_entries` row joined to its run, as the detail route selects. */
export type PayslipEntryDetailRow = {
  id: string;
  org_id: string;
  employee_id: string;
  basic_monthly: number | string;
  hra_monthly: number | string;
  special_allowance_monthly: number | string;
  gross_salary: number | string;
  employee_pf: number | string;
  professional_tax: number | string;
  tds: number | string;
  lop_days: number | string;
  lop_deduction: number | string;
  bonus: number | string;
  total_deductions: number | string;
  net_pay: number | string;
  run: {
    id: string;
    month: string;
    status: string;
    paid_at: string | null;
  } | null;
};

/** A `payroll_line_items` row as the detail route selects it. */
export type PayslipLineItemRow = {
  category: string;
  note: string | null;
  amount: number | string;
  taxable: boolean;
};

const num = (v: number | string | null | undefined): number => Number(v ?? 0);

/** Compose the full detail payload for one entry + its line items. */
export function buildPayslipDetail(
  entry: PayslipEntryDetailRow,
  lineItems: PayslipLineItemRow[],
): MobilePayslipDetail {
  const items: MobilePayslipLineItem[] = lineItems.map((li) => ({
    category: li.category,
    label: li.note ?? null,
    amount: num(li.amount),
    taxable: !!li.taxable,
  }));

  return {
    entryId: entry.id,
    runId: entry.run?.id ?? "",
    month: entry.run?.month ?? "",
    status: (entry.run?.status ?? "processed") as MobilePayslipDetail["status"],
    paidAt: entry.run?.paid_at ?? null,
    earnings: {
      basic: num(entry.basic_monthly),
      hra: num(entry.hra_monthly),
      specialAllowance: num(entry.special_allowance_monthly),
      gross: num(entry.gross_salary),
    },
    deductions: {
      employeePf: num(entry.employee_pf),
      professionalTax: num(entry.professional_tax),
      tds: num(entry.tds),
      lopDays: num(entry.lop_days),
      lopDeduction: num(entry.lop_deduction),
    },
    bonus: num(entry.bonus),
    lineItems: items,
    totalDeductions: num(entry.total_deductions),
    netPay: num(entry.net_pay),
  };
}
