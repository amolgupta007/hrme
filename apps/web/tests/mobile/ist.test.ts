import { describe, expect, it } from "vitest";
import { istDateOf, istToday } from "@jambahr/shared";

describe("istDateOf", () => {
  it("maps a UTC instant to its IST calendar date", () => {
    // 2026-07-17 20:00 UTC = 2026-07-18 01:30 IST
    expect(istDateOf("2026-07-17T20:00:00.000Z")).toBe("2026-07-18");
  });
  it("keeps same date for a mid-day UTC instant", () => {
    // 2026-07-17 06:00 UTC = 2026-07-17 11:30 IST
    expect(istDateOf("2026-07-17T06:00:00.000Z")).toBe("2026-07-17");
  });
  it("handles the IST midnight boundary", () => {
    // 2026-07-17 18:30 UTC = 2026-07-18 00:00 IST
    expect(istDateOf("2026-07-17T18:30:00.000Z")).toBe("2026-07-18");
  });
});

describe("istToday", () => {
  it("derives the IST date from a provided now", () => {
    const nowMs = new Date("2026-07-17T20:00:00.000Z").getTime();
    expect(istToday(nowMs)).toBe("2026-07-18");
  });
});
