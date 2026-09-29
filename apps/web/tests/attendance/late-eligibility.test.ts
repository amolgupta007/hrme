import { describe, it, expect } from "vitest";
import {
  countableLates,
  expandLeaveDates,
  monthBounds,
  type LateDay,
} from "@jambahr/shared/attendance/late-eligibility";

const late = (date: string, extra: Partial<LateDay> = {}): LateDay => ({
  id: `r-${date}`,
  date,
  is_late: true,
  late_minutes: 12,
  late_excused: false,
  clock_in_at: `${date}T04:12:00Z`,
  ...extra,
});

// Sept 2026: the 6th is a Sunday, the 12th is the 2nd Saturday.
const sunOff = { week_type: 6 as const, off_days: [0] };

describe("monthBounds", () => {
  it("returns first and last day, leap-year aware", () => {
    expect(monthBounds("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("expandLeaveDates", () => {
  it("expands ranges and clips to the month", () => {
    const d = expandLeaveDates(
      [
        { start_date: "2026-08-30", end_date: "2026-09-02" },
        { start_date: "2026-09-15", end_date: "2026-09-15" },
      ],
      "2026-09-01",
      "2026-09-30"
    );
    expect([...d].sort()).toEqual(["2026-09-01", "2026-09-02", "2026-09-15"]);
  });
});

describe("countableLates", () => {
  const ctx = { weekOff: sunOff, holidays: new Set<string>(), leaveDates: new Set<string>(), evaluateFrom: null };

  it("keeps plain late days, sorted by date", () => {
    const out = countableLates([late("2026-09-03"), late("2026-09-01")], ctx);
    expect(out.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-03"]);
  });

  it("drops on-time, excused, week-off, holiday and leave days", () => {
    const out = countableLates(
      [
        late("2026-09-01", { is_late: false }),
        late("2026-09-02", { late_excused: true }),
        late("2026-09-06"), // Sunday
        late("2026-09-07"), // holiday
        late("2026-09-08"), // on leave
        late("2026-09-09"),
      ],
      { ...ctx, holidays: new Set(["2026-09-07"]), leaveDates: new Set(["2026-09-08"]) }
    );
    expect(out.map((d) => d.date)).toEqual(["2026-09-09"]);
  });

  it("honours alternate-Saturday week-offs", () => {
    const out = countableLates([late("2026-09-12"), late("2026-09-05")], {
      ...ctx,
      weekOff: { week_type: 6, off_days: [0], alt_saturday_rule: "even_off" },
    });
    expect(out.map((d) => d.date)).toEqual(["2026-09-05"]);
  });

  it("ignores days before the policy's evaluate_from date", () => {
    const out = countableLates([late("2026-09-28"), late("2026-09-30")], { ...ctx, evaluateFrom: "2026-09-30" });
    expect(out.map((d) => d.date)).toEqual(["2026-09-30"]);
  });

  it("with no week-off policy, no day is treated as a week-off", () => {
    const out = countableLates([late("2026-09-06")], { ...ctx, weekOff: null });
    expect(out).toHaveLength(1);
  });
});
