import { describe, expect, it } from "vitest";
import {
  buildHomePayload,
  buildTodayStatus,
  buildLeaveBalances,
  buildAnnouncements,
  resolvePendingApprovals,
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

describe("buildAnnouncements", () => {
  it("maps DB rows to the wire DTO, capped at 3", () => {
    const out = buildAnnouncements([
      { id: "a1", title: "Diwali holidays", body: "Office closed 20–22 Oct.", category: "policy", created_at: "2026-08-01T10:00:00Z" },
      { id: "a2", title: "Town hall", body: "Join us Friday.", category: null, created_at: "2026-08-02T10:00:00Z" },
      { id: "a3", title: "Third", body: "b3", category: "event", created_at: "2026-08-03T10:00:00Z" },
      { id: "a4", title: "Fourth (dropped)", body: "b4", category: "general", created_at: "2026-08-04T10:00:00Z" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      id: "a1",
      title: "Diwali holidays",
      body: "Office closed 20–22 Oct.",
      category: "policy",
      createdAt: "2026-08-01T10:00:00Z",
    });
    expect(out[1].category).toBeNull();
    expect(out.map((a) => a.id)).not.toContain("a4");
  });

  it("returns an empty array for an org with no announcements", () => {
    expect(buildAnnouncements([])).toEqual([]);
  });
});

describe("resolvePendingApprovals", () => {
  it("passes through the raw count for managers/admins", () => {
    expect(resolvePendingApprovals(true, 4)).toBe(4);
    expect(resolvePendingApprovals(true, 0)).toBe(0);
  });

  it("hides the stat (null) for employees regardless of the raw count", () => {
    expect(resolvePendingApprovals(false, 0)).toBeNull();
    expect(resolvePendingApprovals(false, 4)).toBeNull();
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
      pendingApprovals: null,
      trainingsOverdue: 0,
      announcements: [],
      unreadNotifications: 0,
    });

    expect(payload.today.isClockedIn).toBe(true);
    expect(payload.leave.balances).toHaveLength(1);
    expect(payload.leave.balances[0].remaining).toBe(18);
    expect(payload.nextHolidays).toHaveLength(3); // capped
    expect(payload.nextHolidays[0].name).toBe("Independence Day");
    expect(payload.pending).toEqual({ leaveRequests: 2, regularizations: 1 });
    expect(payload.pendingApprovals).toBeNull();
    expect(payload.trainingsOverdue).toBe(0);
    expect(payload.announcements).toEqual([]);
  });

  it("carries manager pending-approvals count and announcements through", () => {
    const payload = buildHomePayload({
      record: null,
      shift: null,
      policies: [],
      holidays: [],
      pendingLeaveRequests: 0,
      pendingRegularizations: 0,
      pendingApprovals: 3,
      trainingsOverdue: 2,
      announcements: [
        { id: "a1", title: "Diwali holidays", body: "Office closed 20–22 Oct.", category: "policy", created_at: "2026-08-01T10:00:00Z" },
      ],
      unreadNotifications: 5,
    });

    expect(payload.pendingApprovals).toBe(3);
    expect(payload.trainingsOverdue).toBe(2);
    expect(payload.announcements).toHaveLength(1);
    expect(payload.announcements[0].title).toBe("Diwali holidays");
    expect(payload.unreadNotifications).toBe(5);
  });
});
