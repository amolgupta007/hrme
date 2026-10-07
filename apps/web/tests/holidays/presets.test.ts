import { describe, expect, it } from "vitest";
import { PRESET_YEARS, presetFor, presetRegionsFor, type HolidayPreset } from "@jambahr/shared/holidays/presets";

const isRealDate = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T00:00:00.000Z`);
  return dt.toISOString().slice(0, 10) === d;
};

describe("holiday presets", () => {
  it("ships 2026 and 2027", () => {
    expect(PRESET_YEARS).toEqual([2026, 2027]);
    expect(presetRegionsFor(2026)).toEqual(["national", "MH"]);
    expect(presetRegionsFor(2027)).toEqual(["national"]); // MH 2027 not yet notified
    expect(presetRegionsFor(2030)).toEqual([]);
  });

  for (const year of [2026, 2027]) {
    for (const region of presetRegionsFor(year)) {
      it(`${year} ${region}: valid dates inside the year, no duplicates, kinds match region`, () => {
        const rows: HolidayPreset[] = presetFor(year, region);
        expect(rows.length).toBeGreaterThan(0);
        const keys = new Set<string>();
        for (const r of rows) {
          expect(isRealDate(r.date), r.date).toBe(true);
          expect(r.date.startsWith(`${year}-`), r.date).toBe(true);
          expect(r.region).toBe(region);
          expect(r.name.trim().length).toBeGreaterThan(0);
          expect(r.name.length).toBeLessThanOrEqual(80);
          if (region === "national") expect(["gazetted", "restricted"]).toContain(r.kind);
          else expect(r.kind).toBe("state");
          const key = `${r.date}|${r.name}`;
          expect(keys.has(key), key).toBe(false);
          keys.add(key);
        }
      });
    }
  }

  it("national lists carry DoPT's 17 gazetted holidays", () => {
    expect(presetFor(2026, "national").filter((r) => r.kind === "gazetted")).toHaveLength(17);
    expect(presetFor(2027, "national").filter((r) => r.kind === "gazetted")).toHaveLength(17);
  });

  it("spot-checks known dates", () => {
    const find = (y: number, reg: "national" | "MH", name: string) =>
      presetFor(y, reg).find((r) => r.name === name)?.date;
    expect(find(2026, "national", "Diwali")).toBe("2026-11-08");
    expect(find(2026, "national", "Dussehra")).toBe("2026-10-20");
    expect(find(2026, "MH", "Diwali (Bali Pratipada)")).toBe("2026-11-10");
    expect(find(2027, "national", "Diwali (Deepavali)")).toBe("2027-10-29");
  });

  it("returns a copy, so callers can't mutate the shared data", () => {
    const a = presetFor(2026, "national");
    a.pop();
    expect(presetFor(2026, "national").length).toBe(a.length + 1);
  });
});
