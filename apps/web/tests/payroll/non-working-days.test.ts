import { describe, expect, it } from "vitest";
import { nonWorkingDatesInMonth } from "@/lib/payroll/non-working-days";

describe("nonWorkingDatesInMonth", () => {
  it("lists the week-offs and holidays of the month", () => {
    const dates = nonWorkingDatesInMonth("2026-08", { week_type: 5, off_days: [0, 6] }, new Set(["2026-08-14"]));
    expect(dates.slice(0, 3)).toEqual(["2026-08-01", "2026-08-02", "2026-08-08"]);
    expect(dates).toContain("2026-08-14");
    expect(dates).toHaveLength(11);
  });
  it("applies the alternate-Saturday rule", () => {
    const dates = nonWorkingDatesInMonth("2026-08", { week_type: 6, off_days: [0], alt_saturday_rule: "odd_off" }, new Set());
    expect(dates).toContain("2026-08-01"); // 1st Saturday
    expect(dates).not.toContain("2026-08-08"); // 2nd Saturday
  });
  it("with no week-off policy only holidays count", () => {
    expect(nonWorkingDatesInMonth("2026-08", null, new Set(["2026-08-15"]))).toEqual(["2026-08-15"]);
  });
});
