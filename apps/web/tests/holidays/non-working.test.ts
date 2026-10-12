import { describe, expect, it } from "vitest";
import { buildNonWorkingDays, eachDate, nonWorkingDateList } from "@jambahr/shared/holidays/non-working";

describe("eachDate", () => {
  it("is inclusive and crosses month ends", () => {
    expect(eachDate("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDate("2026-11-02", "2026-11-01")).toEqual([]);
  });
});

describe("buildNonWorkingDays", () => {
  const satSun = { week_type: 5 as const, off_days: [0, 6] };

  it("splits holidays and week-offs inside the range", () => {
    const d = buildNonWorkingDays({
      from: "2026-11-06",
      to: "2026-11-11",
      holidays: [
        { date: "2026-11-08", name: "Diwali" },
        { date: "2026-11-10", name: "Bali Pratipada" },
        { date: "2026-12-25", name: "Christmas" }, // outside the range
      ],
      weekOff: satSun,
    });
    expect([...d.holidays]).toEqual([["2026-11-08", "Diwali"], ["2026-11-10", "Bali Pratipada"]]);
    expect([...d.weekOffs]).toEqual(["2026-11-07", "2026-11-08"]);
    expect(d.hasWeekOff).toBe(true);
    expect(nonWorkingDateList(d)).toEqual(["2026-11-07", "2026-11-08", "2026-11-10"]);
  });

  it("with no week-off policy only holidays count", () => {
    const d = buildNonWorkingDays({ from: "2026-11-01", to: "2026-11-30", holidays: [], weekOff: null });
    expect(d.weekOffs.size).toBe(0);
    expect(d.hasWeekOff).toBe(false);
  });
});
