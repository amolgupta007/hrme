import { describe, it, expect } from "vitest";
import {
  computeDailyAttendance,
  dedupePunches,
  type PunchEvent,
} from "@/lib/attendance/daily-attendance";

// Helper: build a punch at an IST wall-clock time on 2026-06-23.
// IST is UTC+5:30, so 09:00 IST = 03:30 UTC.
function punch(istHHMM: string, locationId: string | null, id = istHHMM): PunchEvent {
  const [h, m] = istHHMM.split(":").map(Number);
  const utcMs = Date.UTC(2026, 5, 23, h, m) - 5.5 * 3600 * 1000;
  return { id, punched_at: new Date(utcMs).toISOString(), location_id: locationId };
}

describe("computeDailyAttendance", () => {
  it("pools punches across two locations in the zone: first-in@A, last-out@B = 9h", () => {
    const events = [punch("09:00", "A"), punch("13:00", "B"), punch("18:00", "B")];
    const r = computeDailyAttendance({ events, zoneLocationIds: ["A", "B"] });
    expect(r.status).toBe("present");
    expect(r.totalMinutes).toBe(540); // 09:00 -> 18:00, gap included
    expect(r.firstInLocationId).toBe("A");
    expect(r.lastOutLocationId).toBe("B");
    expect(r.punchCount).toBe(3);
    expect(r.contributingIds).toEqual(["09:00", "13:00", "18:00"]);
  });

  it("excludes punches at a location outside the employee's zone", () => {
    // 08:00 happens at C (out of zone) and must be ignored for first-in.
    const events = [punch("08:00", "C"), punch("09:00", "A"), punch("18:00", "B")];
    const r = computeDailyAttendance({ events, zoneLocationIds: ["A", "B"] });
    expect(r.totalMinutes).toBe(540);
    expect(r.firstInLocationId).toBe("A");
    expect(r.outOfZoneCount).toBe(1);
  });

  it("flags a single punch as incomplete with null hours (not 0, not a crash)", () => {
    const events = [punch("09:00", "A")];
    const r = computeDailyAttendance({ events, zoneLocationIds: ["A", "B"] });
    expect(r.status).toBe("incomplete");
    expect(r.totalMinutes).toBeNull();
    expect(r.firstInLocationId).toBe("A");
    expect(r.lastOutLocationId).toBeNull();
  });

  it("marks absent when no in-zone punches exist", () => {
    const events = [punch("09:00", "C"), punch("18:00", "C")]; // all out of zone
    const r = computeDailyAttendance({ events, zoneLocationIds: ["A", "B"] });
    expect(r.status).toBe("absent");
    expect(r.totalMinutes).toBeNull();
    expect(r.outOfZoneCount).toBe(2);
  });

  it("is idempotent and order-independent (late-arriving punch re-folds correctly)", () => {
    const initial = [punch("09:00", "A"), punch("17:00", "B")];
    const r1 = computeDailyAttendance({ events: initial, zoneLocationIds: ["A", "B"] });
    expect(r1.totalMinutes).toBe(480); // 09:00 -> 17:00

    // A late punch at 18:00 arrives out of order; recompute over the full set.
    const withLate = [punch("18:00", "B"), ...initial];
    const r2 = computeDailyAttendance({ events: withLate, zoneLocationIds: ["A", "B"] });
    expect(r2.totalMinutes).toBe(540); // now 09:00 -> 18:00
    expect(r2.lastOutLocationId).toBe("B");
  });

  it("treats 3+ odd punches as plain min/max (no session pairing)", () => {
    const events = [punch("09:00", "A"), punch("12:00", "A"), punch("15:00", "B")];
    const r = computeDailyAttendance({ events, zoneLocationIds: ["A", "B"] });
    expect(r.totalMinutes).toBe(360); // 09:00 -> 15:00
    expect(r.punchCount).toBe(3);
  });

  it("null zone (no assignment) falls back to all locations and flags it", () => {
    const events = [punch("09:00", "A"), punch("18:00", "B")];
    const r = computeDailyAttendance({ events, zoneLocationIds: null });
    expect(r.totalMinutes).toBe(540);
    expect(r.noZoneFallback).toBe(true);
  });
});

describe("dedupePunches", () => {
  it("collapses same-employee same-location punches within the window", () => {
    const events = [punch("09:00:00", "A"), punch("09:00:30", "A", "dup"), punch("18:00", "B")];
    // 09:00:00 and 09:00:30 are 30s apart at the same location -> dedupe (60s window)
    const deduped = dedupePunches(events, 60);
    expect(deduped).toHaveLength(2);
  });

  it("keeps near-simultaneous punches at DIFFERENT locations", () => {
    const events = [punch("09:00", "A"), punch("09:00", "B", "b")];
    const deduped = dedupePunches(events, 60);
    expect(deduped).toHaveLength(2);
  });
});

describe("computeDailyAttendance worked/break minutes", () => {
  it("subtracts lunch from workedMinutes but totalMinutes stays gross span", () => {
    const r = computeDailyAttendance({
      events: [
        punch("09:00", null, "a"),
        punch("13:00", null, "b"),
        punch("14:00", null, "c"),
        punch("18:00", null, "d"),
      ],
      zoneLocationIds: null,
    });
    expect(r.totalMinutes).toBe(540); // gross span (back-compat)
    expect(r.workedMinutes).toBe(480); // minus lunch
    expect(r.breakMinutes).toBe(60);
    expect(r.needsReview).toBe(false);
    expect(r.status).toBe("present");
  });

  it("odd punch count flags needsReview", () => {
    const r = computeDailyAttendance({
      events: [punch("09:00", null, "a"), punch("13:00", null, "b"), punch("14:00", null, "c")],
      zoneLocationIds: null,
    });
    expect(r.workedMinutes).toBe(240);
    expect(r.needsReview).toBe(true);
  });

  it("single punch → incomplete, null worked, needsReview", () => {
    const r = computeDailyAttendance({
      events: [punch("09:00", null, "a")],
      zoneLocationIds: null,
    });
    expect(r.status).toBe("incomplete");
    expect(r.workedMinutes).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});
