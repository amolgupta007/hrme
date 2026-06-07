export type LineItemCategory = "bonus" | "allowance" | "reimbursement" | "other" | "overtime";

export type LineItem = {
  id: string;
  category: LineItemCategory;
  amount: number;
  taxable: boolean;
  note: string | null;
};

export function sumLineItems(items: LineItem[], taxableOnly?: boolean): number {
  return items.reduce((sum, item) => {
    if (taxableOnly === true && !item.taxable) return sum;
    if (taxableOnly === false && item.taxable) return sum;
    return sum + item.amount;
  }, 0);
}

export function partitionByTaxable(items: LineItem[]): { taxable: LineItem[]; nonTaxable: LineItem[] } {
  const taxable: LineItem[] = [];
  const nonTaxable: LineItem[] = [];
  for (const item of items) {
    (item.taxable ? taxable : nonTaxable).push(item);
  }
  return { taxable, nonTaxable };
}
