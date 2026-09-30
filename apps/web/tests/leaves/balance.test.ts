import { describe, it, expect } from "vitest";
import { adjustmentsAsUsage, usedByPolicy } from "@/lib/leaves/balance";

describe("adjustmentsAsUsage", () => {
  it("turns a debit into used days and a credit back into negative usage", () => {
    expect(
      adjustmentsAsUsage([
        { employee_id: "e1", policy_id: "cl", days: -1 },
        { employee_id: "e1", policy_id: "cl", days: -0.5 },
      ])
    ).toEqual([{ employee_id: "e1", policy_id: "cl", days: 1.5 }]);
  });

  it("a deduction and its reversal net to nothing (row dropped)", () => {
    expect(
      adjustmentsAsUsage([
        { employee_id: "e1", policy_id: "cl", days: -1 },
        { employee_id: "e1", policy_id: "cl", days: "1" },
      ])
    ).toEqual([]);
  });

  it("keeps employees and policies apart", () => {
    const rows = adjustmentsAsUsage([
      { employee_id: "e1", policy_id: "cl", days: -1 },
      { employee_id: "e2", policy_id: "cl", days: -1 },
      { employee_id: "e1", policy_id: "sl", days: -0.5 },
    ]);
    expect(rows).toHaveLength(3);
  });
});

describe("usedByPolicy", () => {
  it("adds approved leave and ledger usage together", () => {
    expect(
      usedByPolicy([
        { policy_id: "cl", days: 2 },
        { policy_id: "cl", days: "0.5" },
        { policy_id: "sl", days: 1 },
        ...adjustmentsAsUsage([{ employee_id: "e1", policy_id: "cl", days: -1 }]),
      ])
    ).toEqual({ cl: 3.5, sl: 1 });
  });
});
