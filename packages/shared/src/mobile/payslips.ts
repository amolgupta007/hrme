/**
 * Mobile BFF DTOs for the Staff MVP Payslips screens (Mobile PRD-02, Phase D
 * Slice 2, Task 4). The mobile app and the `/api/mobile/payslips*` route
 * handlers both import from here — these types are the wire contract.
 *
 * Types only. No runtime logic (payload shaping lives web-side in
 * apps/web/src/lib/mobile/payslips-payload.ts). See
 * docs/superpowers/plans/2026-08-10-mobile-phase-d-slice2.md.
 */

/** One row in the payslip list — the minimum the list screen renders. */
export type MobilePayslipListItem = {
  entryId: string;
  runId: string;
  month: string; // YYYY-MM
  status: "processed" | "paid"; // draft runs are never exposed
  paidAt: string | null;
  netPay: number;
};

/** GET /api/mobile/payslips — reverse-chronological (month desc). */
export type MobilePayslipListResponse = MobilePayslipListItem[];

/**
 * One earning/deduction line item on a payslip (from `payroll_line_items`).
 * `label` is the human note the admin attached (`payroll_line_items.note`).
 */
export type MobilePayslipLineItem = {
  category: string; // bonus | allowance | reimbursement | other | overtime
  label: string | null;
  amount: number;
  taxable: boolean;
};

/**
 * GET /api/mobile/payslips/[entryId] — the full breakdown for ONE entry. The
 * entry MUST belong to the caller (org + employee); otherwise the route 404s.
 */
export type MobilePayslipDetail = {
  entryId: string;
  runId: string;
  month: string; // YYYY-MM
  status: "draft" | "processed" | "paid";
  paidAt: string | null;
  earnings: {
    basic: number;
    hra: number;
    specialAllowance: number;
    gross: number;
  };
  deductions: {
    employeePf: number;
    professionalTax: number;
    tds: number;
    lopDays: number;
    lopDeduction: number;
  };
  bonus: number;
  lineItems: MobilePayslipLineItem[];
  totalDeductions: number;
  netPay: number;
};
