import { describe, expect, it } from "vitest";
import { CORE_HOLIDAYS, coreSeedRows } from "@jambahr/shared/holidays/core-seed";

describe("core seed", () => {
  it("has 13 holidays per year: 9 mandatory, 4 optional, all inside the year", () => {
    for (const [year, rows] of Object.entries(CORE_HOLIDAYS)) {
      expect(rows).toHaveLength(13);
      expect(rows.filter((r) => r.is_optional)).toHaveLength(4);
      for (const r of rows) expect(r.date.startsWith(`${year}-`)).toBe(true);
      expect(new Set(rows.map((r) => r.date)).size).toBe(13);
    }
  });

  it("seeds the rest of this year plus all of next year", () => {
    const rows = coreSeedRows("2026-10-07");
    expect(rows.map((r) => r.date)).toEqual([
      "2026-10-20", "2026-11-08", "2026-12-25",
      ...CORE_HOLIDAYS[2027].map((r) => r.date),
    ]);
  });

  it("includes a holiday that falls today", () => {
    expect(coreSeedRows("2026-12-25")[0].date).toBe("2026-12-25");
  });

  it("only seeds what exists when next year has no list", () => {
    expect(coreSeedRows("2027-12-01").map((r) => r.date)).toEqual(["2027-12-25"]);
    expect(coreSeedRows("2031-01-01")).toEqual([]);
  });
});
