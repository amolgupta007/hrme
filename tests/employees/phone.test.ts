import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalizes a bare 10-digit Indian mobile to E.164", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
  });
  it("strips spaces, dashes and parens", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("987-654-3210")).toBe("+919876543210");
  });
  it("handles a leading 0", () => {
    expect(normalizePhone("09876543210")).toBe("+919876543210");
  });
  it("handles a 91 country prefix without +", () => {
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });
  it("keeps an already-E.164 number", () => {
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });
  it("passes through a valid non-India E.164 number", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });
  it("rejects Indian numbers not starting 6-9", () => {
    expect(normalizePhone("1234567890")).toBeNull();
  });
  it("rejects too-short input", () => {
    expect(normalizePhone("12345")).toBeNull();
  });
  it("returns null for empty / nullish", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("is true for normalizable input", () => {
    expect(isValidPhone("9876543210")).toBe(true);
  });
  it("is false for junk", () => {
    expect(isValidPhone("abc")).toBe(false);
  });
});
