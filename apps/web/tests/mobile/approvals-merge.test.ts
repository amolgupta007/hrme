import { describe, expect, it } from "vitest";
import { buildApprovalsPayload, type MobileApprovalItem } from "@jambahr/shared";

function item(overrides: Partial<MobileApprovalItem> & Pick<MobileApprovalItem, "id" | "type" | "when">): MobileApprovalItem {
  return {
    who: "Someone",
    what: "Did a thing",
    impact: "Some impact",
    meta: {},
    ...overrides,
  };
}

describe("buildApprovalsPayload", () => {
  it("merges 2 leave + 1 ot + 1 payroll items, sorted newest-first, with correct counts", () => {
    const leave: MobileApprovalItem[] = [
      item({ id: "leave-1", type: "leave", when: "2026-08-01T10:00:00Z" }),
      item({ id: "leave-2", type: "leave", when: "2026-08-10T09:00:00Z" }),
    ];
    const regularization: MobileApprovalItem[] = [];
    const ot: MobileApprovalItem[] = [item({ id: "ot-1", type: "ot", when: "2026-08-05T12:00:00Z" })];
    const payroll: MobileApprovalItem[] = [item({ id: "payroll-1", type: "payroll", when: "2026-08-11T08:00:00Z" })];

    const result = buildApprovalsPayload({ leave, regularization, ot, payroll });

    expect(result.items.map((i) => i.id)).toEqual(["payroll-1", "leave-2", "ot-1", "leave-1"]);
    expect(result.counts).toEqual({ leave: 2, regularization: 0, ot: 1, payroll: 1, total: 4 });
  });
});
