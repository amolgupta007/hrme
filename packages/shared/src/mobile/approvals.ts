/**
 * Mobile BFF DTOs for the merged Approvals inbox (Mobile PRD D4, Task 2). The
 * mobile app and the `/api/mobile/approvals` route handler both import from
 * here — these types are the wire contract.
 *
 * `buildApprovalsPayload` is the pure merge step: given already-normalized
 * per-type arrays (fetched + normalized by later tasks), concat them, sort
 * newest-first by `when`, and compute counts. No I/O here.
 */

export type MobileApprovalType = "leave" | "regularization" | "ot" | "payroll";

export interface MobileApprovalItem {
  id: string;
  type: MobileApprovalType;
  who: string;
  what: string;
  when: string;
  impact: string;
  meta: Record<string, unknown>;
}

export interface MobileApprovalsResponse {
  items: MobileApprovalItem[];
  counts: {
    leave: number;
    regularization: number;
    ot: number;
    payroll: number;
    total: number;
  };
}

export function buildApprovalsPayload(input: {
  leave: MobileApprovalItem[];
  regularization: MobileApprovalItem[];
  ot: MobileApprovalItem[];
  payroll: MobileApprovalItem[];
}): MobileApprovalsResponse {
  const { leave, regularization, ot, payroll } = input;
  const items = [...leave, ...regularization, ...ot, ...payroll].sort((a, b) =>
    a.when < b.when ? 1 : a.when > b.when ? -1 : 0
  );

  return {
    items,
    counts: {
      leave: leave.length,
      regularization: regularization.length,
      ot: ot.length,
      payroll: payroll.length,
      total: items.length,
    },
  };
}
