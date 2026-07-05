import { describe, it, expect } from "vitest";
import { parseHHMM, computeShiftTotalHours, isOvernight } from "@/lib/attendance/shift-time";

describe("parseHHMM", () => {
  it("parses HH:MM into minutes past midnight", () => {
    expect(parseHHMM("09:00")).toBe(9 * 60);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(23 * 60 + 59);
  });
  it("throws on invalid input", () => {
    expect(() => parseHHMM("9:00")).toThrow();
    expect(() => parseHHMM("24:00")).toThrow();
    expect(() => parseHHMM("ab:cd")).toThrow();
  });
});

describe("isOvernight", () => {
  it("flags shifts whose end < start", () => {
    expect(isOvernight("22:00", "06:00")).toBe(true);
    expect(isOvernight("09:00", "17:00")).toBe(false);
    expect(isOvernight("00:00", "08:00")).toBe(false);
  });
  it("returns false when start === end (24h shift edge case → reject in form, but helper is true-or-false)", () => {
    expect(isOvernight("06:00", "06:00")).toBe(false);
  });
});

describe("computeShiftTotalHours", () => {
  it("computes regular daytime shift hours minus break", () => {
    expect(computeShiftTotalHours("09:00", "17:00", 0)).toBe(8);
    expect(computeShiftTotalHours("09:00", "17:00", 30)).toBe(7.5);
  });
  it("computes overnight shift hours correctly", () => {
    expect(computeShiftTotalHours("22:00", "06:00", 0)).toBe(8);
    expect(computeShiftTotalHours("22:00", "06:00", 60)).toBe(7);
  });
  it("rejects break >= shift duration", () => {
    expect(() => computeShiftTotalHours("09:00", "10:00", 60)).toThrow();
  });
});

describe("parseHHMM accepts Postgres TIME format (HH:MM:SS)", () => {
  it("treats HH:MM:SS the same as HH:MM (seconds discarded)", () => {
    expect(parseHHMM("09:00:00")).toBe(9 * 60);
    expect(parseHHMM("17:30:45")).toBe(17 * 60 + 30);
    expect(parseHHMM("23:59:59")).toBe(23 * 60 + 59);
  });
  it("still rejects malformed values with seconds", () => {
    expect(() => parseHHMM("09:00:60")).toThrow();
    expect(() => parseHHMM("09:00:")).toThrow();
    expect(() => parseHHMM("09:00:00:00")).toThrow();
  });
  it("computeShiftTotalHours works with HH:MM:SS inputs (bug fix: was crashing on edit of saved shift)", () => {
    expect(computeShiftTotalHours("09:00:00", "17:00:00", 0)).toBe(8);
    expect(computeShiftTotalHours("22:00:00", "06:00:00", 0)).toBe(8);
  });
});
