import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fake-supabase";
import { loadNonWorkingDays } from "@/lib/holidays/non-working-days";
import { loadNonWorkingDates } from "@/lib/payroll/non-working-days";

const db = () => ({
  holidays: [
    { org_id: "A", date: "2026-11-08", name: "Diwali", is_optional: false },
    { org_id: "A", date: "2026-11-11", name: "Bhai Duj", is_optional: true },
    { org_id: "B", date: "2026-11-10", name: "Other org", is_optional: false },
  ],
  week_off_policy: [{ org_id: "A", week_type: 5, off_days: [0, 6], alt_saturday_rule: "none", effective_from: "2026-01-01" }],
  employee_week_off_override: [{ org_id: "A", employee_id: "e2", week_type: 6, off_days: [1], alt_saturday_rule: "none" }],
  department_week_off_override: [],
});

describe("loadNonWorkingDays", () => {
  it("resolves per employee: mandatory holidays only, own org only, employee override wins", async () => {
    const out = await loadNonWorkingDays(createFakeSupabase(db()) as any, {
      orgId: "A",
      employees: [{ id: "e1", department_id: null }, { id: "e2", department_id: null }],
      from: "2026-11-07",
      to: "2026-11-11",
    });
    const e1 = out.get("e1")!;
    expect([...e1.holidays.keys()]).toEqual(["2026-11-08"]); // optional Bhai Duj and org B excluded
    expect([...e1.weekOffs]).toEqual(["2026-11-07", "2026-11-08"]);
    const e2 = out.get("e2")!;
    expect([...e2.weekOffs]).toEqual(["2026-11-09"]); // Monday off via override
  });

  it("throws when a query fails instead of reporting no holidays", async () => {
    const failing = {
      from: (t: string) => {
        const b: any = createFakeSupabase(db()).from(t);
        if (t !== "holidays") return b;
        const chain: any = new Proxy(b, {
          get: (target, p) =>
            p === "then"
              ? (res: any) => Promise.resolve({ data: null, error: { message: "boom" } }).then(res)
              : typeof target[p] === "function"
                ? (...a: any[]) => (target[p](...a), chain)
                : target[p],
        });
        return chain;
      },
    };
    await expect(
      loadNonWorkingDays(failing as any, { orgId: "A", employees: [{ id: "e1", department_id: null }], from: "2026-11-01", to: "2026-11-30" })
    ).rejects.toThrow("holidays: boom");
  });
});

describe("payroll wrapper parity", () => {
  it("loadNonWorkingDates returns the month's sorted dates + hasWeekOff, as before", async () => {
    const out = await loadNonWorkingDates(createFakeSupabase(db()) as any, {
      orgId: "A",
      month: "2026-11",
      employees: [{ id: "e1", department_id: null }],
    });
    const e1 = out.get("e1")!;
    expect(e1.hasWeekOff).toBe(true);
    expect(e1.dates).toContain("2026-11-08");
    expect(e1.dates).not.toContain("2026-11-11");
    expect(e1.dates).toEqual([...e1.dates].sort());
    expect(e1.dates).toHaveLength(9); // 9 weekend days in Nov 2026 (8 Nov is both a Sunday and Diwali)
  });
});
