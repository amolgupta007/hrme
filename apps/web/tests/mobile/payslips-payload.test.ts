import { describe, it, expect } from "vitest";
import {
  buildPayslipList,
  buildPayslipDetail,
  type PayslipEntryRow,
  type PayslipEntryDetailRow,
  type PayslipLineItemRow,
} from "@/lib/mobile/payslips-payload";

describe("buildPayslipList", () => {
  const rows: PayslipEntryRow[] = [
    { id: "e-jun", net_pay: "50000", run: { id: "r-jun", month: "2026-06", status: "paid", paid_at: "2026-07-01" } },
    { id: "e-may", net_pay: 48000, run: { id: "r-may", month: "2026-05", status: "processed", paid_at: null } },
    { id: "e-jul-draft", net_pay: 51000, run: { id: "r-jul", month: "2026-07", status: "draft", paid_at: null } },
    { id: "e-orphan", net_pay: 1, run: null },
  ];

  it("excludes draft runs and orphan (no-run) entries", () => {
    const out = buildPayslipList(rows);
    const ids = out.map((r) => r.entryId);
    expect(ids).not.toContain("e-jul-draft");
    expect(ids).not.toContain("e-orphan");
    expect(ids).toEqual(["e-jun", "e-may"]);
  });

  it("sorts month-descending and coerces net_pay to number", () => {
    const out = buildPayslipList(rows);
    expect(out[0].month).toBe("2026-06");
    expect(out[1].month).toBe("2026-05");
    expect(out[0].netPay).toBe(50000);
    expect(typeof out[1].netPay).toBe("number");
  });
});

describe("buildPayslipDetail", () => {
  const entry: PayslipEntryDetailRow = {
    id: "e-1",
    org_id: "org-1",
    employee_id: "emp-1",
    basic_monthly: "20000",
    hra_monthly: 10000,
    special_allowance_monthly: 5000,
    gross_salary: 35000,
    employee_pf: 1800,
    professional_tax: 200,
    tds: 1500,
    lop_days: 1,
    lop_deduction: 1000,
    bonus: 2000,
    total_deductions: 4500,
    net_pay: 32500,
    run: { id: "r-1", month: "2026-06", status: "paid", paid_at: "2026-07-01" },
  };
  const lineItems: PayslipLineItemRow[] = [
    { category: "allowance", note: "Travel", amount: "1200", taxable: true },
    { category: "reimbursement", note: null, amount: 800, taxable: false },
  ];

  it("composes earnings, deductions, bonus and line items", () => {
    const d = buildPayslipDetail(entry, lineItems);
    expect(d.entryId).toBe("e-1");
    expect(d.runId).toBe("r-1");
    expect(d.month).toBe("2026-06");
    expect(d.earnings).toEqual({ basic: 20000, hra: 10000, specialAllowance: 5000, gross: 35000 });
    expect(d.deductions).toEqual({
      employeePf: 1800,
      professionalTax: 200,
      tds: 1500,
      lopDays: 1,
      lopDeduction: 1000,
    });
    expect(d.bonus).toBe(2000);
    expect(d.totalDeductions).toBe(4500);
    expect(d.netPay).toBe(32500);
  });

  it("maps line-item note→label and coerces amounts", () => {
    const d = buildPayslipDetail(entry, lineItems);
    expect(d.lineItems).toEqual([
      { category: "allowance", label: "Travel", amount: 1200, taxable: true },
      { category: "reimbursement", label: null, amount: 800, taxable: false },
    ]);
  });
});
