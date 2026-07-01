import { describe, it, expect } from "vitest";
import { pairPunches } from "@/lib/attendance/pair-punches";

const t = (hhmm: string) => `2026-07-01T${hhmm}:00.000Z`;

describe("pairPunches", () => {
  it("empty → incomplete, zero worked", () => {
    const r = pairPunches([]);
    expect(r.pairedStatus).toBe("incomplete");
    expect(r.workedMinutes).toBe(0);
    expect(r.needsReview).toBe(true);
  });

  it("single punch → incomplete dangling in", () => {
    const r = pairPunches([{ id: "a", punched_at: t("09:00") }]);
    expect(r.pairedStatus).toBe("incomplete");
    expect(r.danglingInAt).toBe(t("09:00"));
    expect(r.workedMinutes).toBe(0);
  });

  it("simple in/out → worked = span, no break", () => {
    const r = pairPunches([
      { id: "a", punched_at: t("09:00") },
      { id: "b", punched_at: t("17:00") },
    ]);
    expect(r.pairedStatus).toBe("present");
    expect(r.workedMinutes).toBe(480);
    expect(r.breakMinutes).toBe(0);
    expect(r.intervals).toHaveLength(1);
    expect(r.needsReview).toBe(false);
  });

  it("in / lunch-out / lunch-in / out → break subtracted", () => {
    const r = pairPunches([
      { id: "a", punched_at: t("09:00") },
      { id: "b", punched_at: t("13:00") },
      { id: "c", punched_at: t("14:00") },
      { id: "d", punched_at: t("18:00") },
    ]);
    expect(r.workedMinutes).toBe(480); // 4h + 4h
    expect(r.breakMinutes).toBe(60);
    expect(r.grossSpanMinutes).toBe(540);
    expect(r.intervals).toHaveLength(2);
    expect(r.needsReview).toBe(false);
  });

  it("odd count (missed out) → pairs what it can, flags dangling", () => {
    const r = pairPunches([
      { id: "a", punched_at: t("09:00") },
      { id: "b", punched_at: t("13:00") },
      { id: "c", punched_at: t("14:00") },
    ]);
    expect(r.workedMinutes).toBe(240); // only 09:00–13:00 closed
    expect(r.danglingInAt).toBe(t("14:00"));
    expect(r.needsReview).toBe(true);
    expect(r.pairedStatus).toBe("incomplete");
  });

  it("sorts unsorted input", () => {
    const r = pairPunches([
      { id: "b", punched_at: t("17:00") },
      { id: "a", punched_at: t("09:00") },
    ]);
    expect(r.intervals[0].inAt).toBe(t("09:00"));
    expect(r.workedMinutes).toBe(480);
  });
});
