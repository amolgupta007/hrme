import { describe, it, expect } from "vitest";
import {
  istTodayDate,
  validateManualPunch,
} from "@/lib/attendance/manual-punch-validation";

describe("validateManualPunch — future date", () => {
  const today = "2026-07-31";

  it("rejects a punch dated after today-IST for admins", () => {
    expect(
      validateManualPunch({ istDate: "2026-08-01", todayIst: today, note: null, isAdmin: true }),
    ).toBe("Cannot add a punch in the future");
  });

  it("rejects a future punch for non-admins too", () => {
    expect(
      validateManualPunch({ istDate: "2026-08-01", todayIst: today, note: "fixing my punch", isAdmin: false }),
    ).toBe("Cannot add a punch in the future");
  });

  it("accepts today's date", () => {
    expect(
      validateManualPunch({ istDate: today, todayIst: today, note: null, isAdmin: true }),
    ).toBeNull();
  });

  it("accepts a past date", () => {
    expect(
      validateManualPunch({ istDate: "2026-07-01", todayIst: today, note: null, isAdmin: true }),
    ).toBeNull();
  });
});

describe("validateManualPunch — note requirement", () => {
  const today = "2026-07-31";

  it("requires a note (>=3 chars trimmed) for non-admin actors", () => {
    expect(
      validateManualPunch({ istDate: today, todayIst: today, note: null, isAdmin: false }),
    ).toBe("A note explaining the correction is required");
    expect(
      validateManualPunch({ istDate: today, todayIst: today, note: "  ab  ", isAdmin: false }),
    ).toBe("A note explaining the correction is required");
  });

  it("accepts a non-admin punch with a >=3 char note", () => {
    expect(
      validateManualPunch({ istDate: today, todayIst: today, note: "forgot to clock out", isAdmin: false }),
    ).toBeNull();
  });

  it("does not require a note for admin actors", () => {
    expect(
      validateManualPunch({ istDate: today, todayIst: today, note: null, isAdmin: true }),
    ).toBeNull();
  });

  it("checks the future rule before the note rule", () => {
    // future + missing note → future message wins
    expect(
      validateManualPunch({ istDate: "2026-08-05", todayIst: today, note: null, isAdmin: false }),
    ).toBe("Cannot add a punch in the future");
  });
});

describe("istTodayDate", () => {
  it("returns the IST calendar date for an instant just before IST midnight", () => {
    // 2026-07-31 18:20 UTC = 2026-07-31 23:50 IST
    expect(istTodayDate(new Date("2026-07-31T18:20:00Z"))).toBe("2026-07-31");
  });

  it("rolls to the next IST date after 18:30 UTC", () => {
    // 2026-07-31 18:40 UTC = 2026-08-01 00:10 IST
    expect(istTodayDate(new Date("2026-07-31T18:40:00Z"))).toBe("2026-08-01");
  });
});
