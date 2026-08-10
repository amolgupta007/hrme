import { describe, expect, it } from "vitest";
import {
  buildHomePayload,
  buildTodayStatus,
  buildLeaveBalances,
} from "@/lib/mobile/home-payload";

describe("buildTodayStatus", () => {
  it("reports clocked-in when in exists and out is null", () => {
    const s = buildTodayStatus(
      { clock_in_at: "2026-07-17T04:00:00Z", clock_out_at: null, total_minutes: null },
      { name: "General", start_time: "09:30", end_time: "18:30" },
    );
    expect(s).toEqual({
      isClockedIn: true,
      clockInAt: "2026-07-17T04:00:00Z",
      clockOutAt: null,
      minutesToday: null,
      shift: { name: "General", start: "09:30", end: "18:30" },
    });
  });

  it("reports not-clocked-in once out is set", () => {
    const s = buildTodayStatus(
      { clock_in_at: "2026-07-17T04:00:00Z", clock_out_at: "2026-07-17T13:00:00Z", total_minutes: 480 },
      null,
    );
    expect(s.isClockedIn).toBe(false);
    expect(s.minutesToday).toBe(480);
    expect(s.shift).toBeNull();
  });

  it("handles a null record (no attendance today)", () => {
    const s = buildTodayStatus(null, null);
    expect(s).toEqual({
      isClockedIn: false,
      clockInAt: null,
      clockOutAt: null,
      minutesToday: null,
      shift: null,
    });
  });
});

describe("buildLeaveBalances", () => {
  it("computes remaining = total - used, clamped at 0", () => {
    const out = buildLeaveBalances([
      { id: "p1", name: "Annual Leave", type: "paid", days_per_year: 21, used: 5 },
      { id: "p2", name: "Sick Leave", type: "sick", days_per_year: 10, used: 12 },
    ]);
    expect(out).toEqual([
      { policyId: "p1", name: "Annual Leave", type: "paid", total: 21, used: 5, remaining: 16 },
      { policyId: "p2", name: "Sick Leave", type: "sick", total: 10, used: 12, remaining: 0 },
    ]);
  });
});

describe("buildHomePayload", () => {
  it("assembles today + balances + capped holidays + pending counts", () => {
    const payload = buildHomePayload({
      record: { clock_in_at: "2026-07-17T04:00:00Z", clock_out_at: null, total_minutes: null },
      shift: { name: "General", start_time: "09:30", end_time: "18:30" },
      policies: [{ id: "p1", name: "Annual Leave", type: "paid", days_per_year: 21, used: 3 }],
      holidays: [
        { date: "2026-08-15", name: "Independence Day", is_optional: false },
        { date: "2026-10-02", name: "Gandhi Jayanti", is_optional: false },
        { date: "2026-10-20", name: "Diwali", is_optional: false },
        { date: "2026-12-25", name: "Christmas", is_optional: true },
      ],
      pendingLeaveRequests: 2,
      pendingRegularizations: 1,
    });

    expect(payload.today.isClockedIn).toBe(true);
    expect(payload.leave.balances).toHaveLength(1);
    expect(payload.leave.balances[0].remaining).toBe(18);
    expect(payload.nextHolidays).toHaveLength(3); // capped
    expect(payload.nextHolidays[0].name).toBe("Independence Day");
    expect(payload.pending).toEqual({ leaveRequests: 2, regularizations: 1 });
  });
});
