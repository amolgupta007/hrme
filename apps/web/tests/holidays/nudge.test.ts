import { describe, expect, it } from "vitest";
import { holidayNudgeYear } from "@jambahr/shared/holidays/nudge";

describe("holidayNudgeYear", () => {
  it("nudges from 1 November when next year is empty", () => {
    expect(holidayNudgeYear("2026-11-01", 0)).toBe(2027);
    expect(holidayNudgeYear("2026-12-31", 0)).toBe(2027);
  });
  it("stays quiet before November or once next year has holidays", () => {
    expect(holidayNudgeYear("2026-10-31", 0)).toBeNull();
    expect(holidayNudgeYear("2026-11-15", 3)).toBeNull();
  });
});
