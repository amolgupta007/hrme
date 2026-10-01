import { describe, it, expect } from "vitest";
import { deriveWorkSessions, autoCloseInstant } from "@jambahr/shared/attendance/sessions";

const ist = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00+05:30`).toISOString();
const p = (...times: string[]) => times.map((t) => ({ punched_at: ist(t) }));

describe("deriveWorkSessions", () => {
  it("no punches → nothing open", () => {
    expect(deriveWorkSessions([])).toMatchObject({ sessions: [], open: false, closedMinutes: 0 });
  });

  it("one clock-in → open session", () => {
    const s = deriveWorkSessions(p("10:00"));
    expect(s.open).toBe(true);
    expect(s.sessions).toEqual([{ inAt: ist("10:00"), outAt: null, minutes: null }]);
  });

  it("in, out, in → clocked in again; only the closed session counts", () => {
    const s = deriveWorkSessions(p("10:00", "13:00", "14:00"));
    expect(s.open).toBe(true);
    expect(s.closedMinutes).toBe(180);
    expect(s.sessions).toHaveLength(2);
    expect(s.firstInAt).toBe(ist("10:00"));
    expect(s.lastPunchAt).toBe(ist("14:00"));
  });

  it("two full sessions → closed, break excluded", () => {
    const s = deriveWorkSessions(p("10:00", "13:00", "14:00", "19:00"));
    expect(s.open).toBe(false);
    expect(s.closedMinutes).toBe(480);
  });

  it("punches within 60s collapse (matches the rollup)", () => {
    const s = deriveWorkSessions([
      { punched_at: ist("10:00") },
      { punched_at: "2026-10-01T04:30:30.000Z" }, // 10:00:30 IST
    ]);
    expect(s.open).toBe(true);
    expect(s.sessions).toHaveLength(1);
  });

  it("order of input doesn't matter", () => {
    expect(deriveWorkSessions(p("14:00", "10:00", "13:00")).closedMinutes).toBe(180);
  });
});

describe("autoCloseInstant", () => {
  const H = 60 * 60 * 1000;
  const firstInMs = Date.parse(ist("10:00"));
  const dayCapMs = Date.parse(ist("23:59"));

  it("closes at first clock-in + shift hours (unchanged rule)", () => {
    expect(
      autoCloseInstant({ firstInMs, lastPunchMs: Date.parse(ist("14:00")), hours: 9, dayCapMs }),
    ).toBe(Date.parse(ist("19:00")));
  });

  it("never closes before the last clock-in — 2 minutes after it", () => {
    expect(
      autoCloseInstant({ firstInMs, lastPunchMs: Date.parse(ist("20:30")), hours: 9, dayCapMs }),
    ).toBe(Date.parse(ist("20:32")));
  });

  it("is capped at the end of the day", () => {
    expect(autoCloseInstant({ firstInMs, lastPunchMs: firstInMs, hours: 16, dayCapMs })).toBe(
      dayCapMs,
    );
    expect(firstInMs + 16 * H).toBeGreaterThan(dayCapMs);
  });
});
