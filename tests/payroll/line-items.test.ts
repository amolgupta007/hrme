import { describe, it, expect } from "vitest";
import { sumLineItems, partitionByTaxable, type LineItem } from "@/lib/payroll/line-items";

const items: LineItem[] = [
  { id: "1", category: "bonus",         amount: 5_000, taxable: true,  note: "festival" },
  { id: "2", category: "allowance",     amount: 2_000, taxable: true,  note: "WFH" },
  { id: "3", category: "reimbursement", amount: 1_500, taxable: false, note: "travel" },
  { id: "4", category: "other",         amount: 800,   taxable: false, note: null },
];

describe("sumLineItems", () => {
  it("sums all when taxableOnly omitted", () => {
    expect(sumLineItems(items)).toBe(9_300);
  });
  it("sums taxable only when taxableOnly=true", () => {
    expect(sumLineItems(items, true)).toBe(7_000);
  });
  it("sums non-taxable when taxableOnly=false", () => {
    expect(sumLineItems(items, false)).toBe(2_300);
  });
  it("returns 0 on empty array", () => {
    expect(sumLineItems([])).toBe(0);
  });
});

describe("partitionByTaxable", () => {
  it("splits items into taxable and nonTaxable buckets", () => {
    const { taxable, nonTaxable } = partitionByTaxable(items);
    expect(taxable).toHaveLength(2);
    expect(nonTaxable).toHaveLength(2);
    expect(taxable.map((i) => i.id).sort()).toEqual(["1", "2"]);
    expect(nonTaxable.map((i) => i.id).sort()).toEqual(["3", "4"]);
  });
});
