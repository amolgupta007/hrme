import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";
import {
  activeReminderFor,
  dueReminderKinds,
  formatReminderTime,
  istClock,
  isValidReminderTime,
  needsReminder,
  normalizeReminderSettings,
  serializeReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderCandidate,
} from "@jambahr/shared/attendance/reminders";

// ---- Mocks for the dispatch run ----------------------------------------
vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<html/>") }));
const batches: any[][] = [];
vi.mock("@/lib/resend", () => ({
  FROM_EMAIL: "support@jambahr.com",
  NOREPLY_EMAIL: "noreply@jambahr.com",
  resend: { batch: { send: vi.fn(async (msgs: any[]) => { batches.push(msgs); return { data: {}, error: null }; }) } },
}));
const pushed: any[] = [];
vi.mock("@/lib/mobile/push", () => ({ sendPush: vi.fn(async (_sb: any, ids: string[], msg: any) => { pushed.push({ ids, msg }); }) }));

import { runAttendanceReminders } from "../../src/lib/attendance/reminders-dispatch";

const on = { ...DEFAULT_REMINDER_SETTINGS, enabled: true };
const idle: ReminderCandidate = { excluded: false, nonWorkingToday: false, onLeaveToday: false, clockedIn: false, sessionOpen: false };

describe("reminder rules", () => {
  it("defaults to off, 10:15 / 19:30, email + in-app", () => {
    expect(normalizeReminderSettings({})).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(normalizeReminderSettings(null).enabled).toBe(false);
  });

  it("round-trips the stored shape and rejects bad times", () => {
    const s = { ...on, clockIn: { enabled: true, time: "09:45" }, excludedEmployeeIds: ["a", "a", "b"] };
    const back = normalizeReminderSettings({ attendance: { reminders: serializeReminderSettings(s) } });
    expect(back).toEqual({ ...s, excludedEmployeeIds: ["a", "b"] });
    expect(normalizeReminderSettings({ attendance: { reminders: { enabled: true, clock_in_time: "25:00" } } }).clockIn.time).toBe("10:15");
    expect(isValidReminderTime("10:15")).toBe(true);
    expect(isValidReminderTime("10:17")).toBe(false); // 5-minute steps
  });

  it("is due from the set time for an hour, then never again that day", () => {
    const at = (h: number, m: number) => dueReminderKinds(on, h * 60 + m);
    expect(at(10, 14)).toEqual([]);
    expect(at(10, 15)).toEqual(["clock_in"]);
    expect(at(11, 14)).toEqual(["clock_in"]);
    expect(at(11, 15)).toEqual([]);
    expect(at(19, 30)).toEqual(["clock_out"]);
    expect(dueReminderKinds({ ...on, enabled: false }, 10 * 60 + 15)).toEqual([]);
    expect(dueReminderKinds({ ...on, email: false, inApp: false }, 10 * 60 + 15)).toEqual([]);
    expect(dueReminderKinds({ ...on, clockIn: { enabled: false, time: "10:15" } }, 10 * 60 + 15)).toEqual([]);
  });

  it("clock-in skips week-offs, holidays, leave, the excluded and the already clocked in", () => {
    expect(needsReminder("clock_in", idle)).toBe(true);
    expect(needsReminder("clock_in", { ...idle, nonWorkingToday: true })).toBe(false);
    expect(needsReminder("clock_in", { ...idle, onLeaveToday: true })).toBe(false);
    expect(needsReminder("clock_in", { ...idle, excluded: true })).toBe(false);
    expect(needsReminder("clock_in", { ...idle, clockedIn: true, sessionOpen: true })).toBe(false);
  });

  it("clock-out goes to anyone still clocked in — even on a week-off", () => {
    expect(needsReminder("clock_out", { ...idle, clockedIn: true, sessionOpen: true, nonWorkingToday: true })).toBe(true);
    expect(needsReminder("clock_out", { ...idle, clockedIn: true, sessionOpen: false })).toBe(false);
    expect(needsReminder("clock_out", { ...idle, clockedIn: true, sessionOpen: true, excluded: true })).toBe(false);
  });

  it("bell: shows after the time with no hour limit, clock-out first", () => {
    expect(activeReminderFor(on, 10 * 60, idle)).toBeNull();
    expect(activeReminderFor(on, 15 * 60, idle)).toBe("clock_in");
    expect(activeReminderFor(on, 20 * 60, { ...idle, clockedIn: true, sessionOpen: true })).toBe("clock_out");
    expect(activeReminderFor({ ...on, inApp: false }, 15 * 60, idle)).toBeNull();
  });

  it("formats times and reads the IST clock", () => {
    expect(formatReminderTime("10:15")).toBe("10:15 AM");
    expect(formatReminderTime("19:30")).toBe("7:30 PM");
    expect(formatReminderTime("00:05")).toBe("12:05 AM");
    expect(istClock(new Date("2026-10-15T04:45:00Z"))).toEqual({ date: "2026-10-15", minutes: 615 });
  });
});

// ---- Dispatch -------------------------------------------------------------
const ORG = "org-a";
const OTHER = "org-b";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANUP, PREM, SAEE, VEDIKA, SIDD, NOMAIL, LEFT, OUTSIDER] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);

let db: FakeDb;
const emp = (eid: string, first: string, extra: object = {}) => ({
  id: eid, org_id: ORG, first_name: first, email: `${first.toLowerCase()}@acme.test`, department_id: null, status: "active", ...extra,
});
const settings = (reminders: object) => ({ attendance_enabled: true, attendance: { reminders: { enabled: true, ...reminders } } });

beforeEach(() => {
  batches.length = 0;
  pushed.length = 0;
  db = {
    organizations: [
      { id: ORG, name: "Acme ", settings: settings({ excluded_employee_ids: [SIDD] }) },
      { id: OTHER, name: "Other", settings: settings({}) },
    ],
    employees: [
      emp(ANUP, "Anup"), // not clocked in → reminded
      emp(PREM, "Prem"), // clocked in → not reminded in the morning
      emp(SAEE, "Saee"), // on leave today
      emp(VEDIKA, "Vedika"), // employee week-off override: Thursday off
      emp(SIDD, "Sidd"), // excluded
      emp(NOMAIL, "Phone", { email: null }), // phone-only → in-app only
      emp(LEFT, "Left", { status: "terminated" }),
      { ...emp(OUTSIDER, "Out"), org_id: OTHER },
    ],
    attendance_records: [
      { org_id: ORG, employee_id: PREM, date: "2026-10-15", clock_in_at: "2026-10-15T04:20:00Z", clock_out_at: null },
    ],
    leave_requests: [
      { org_id: ORG, employee_id: SAEE, status: "approved", start_date: "2026-10-15", end_date: "2026-10-16" },
      { org_id: ORG, employee_id: ANUP, status: "pending", start_date: "2026-10-15", end_date: "2026-10-15" },
    ],
    week_off_policy: [{ org_id: ORG, week_type: 5, off_days: [0, 6], alt_saturday_rule: "none", effective_from: "2026-01-01" }],
    employee_week_off_override: [{ org_id: ORG, employee_id: VEDIKA, week_type: 6, off_days: [4], alt_saturday_rule: "none" }],
    holidays: [],
    notifications: [],
    attendance_reminder_log: [],
  };
});

const THU_1020_IST = new Date("2026-10-15T04:50:00Z"); // Thu 15 Oct, 10:20 IST
const THU_1935_IST = new Date("2026-10-15T14:05:00Z"); // 19:35 IST

describe("runAttendanceReminders", () => {
  it("reminds only active, working, not-on-leave, not-excluded people who haven't clocked in — own org only", async () => {
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    const acme = db.attendance_reminder_log.filter((r) => r.org_id === ORG).map((r) => r.employee_id).sort();
    expect(acme).toEqual([ANUP, NOMAIL].sort());
    expect(db.attendance_reminder_log.every((r) => r.kind === "clock_in" && r.date === "2026-10-15")).toBe(true);
    // The other org got its own run, for its own people only.
    expect(db.attendance_reminder_log.filter((r) => r.org_id === OTHER).map((r) => r.employee_id)).toEqual([OUTSIDER]);
  });

  it("emails those with an address, in-app + push for all, and records the outcome", async () => {
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    const acmeEmails = batches.flat().map((m) => m.to).filter((t) => t.endsWith("@acme.test")).sort();
    expect(acmeEmails).toEqual(["anup@acme.test", "out@acme.test"].sort());
    expect(batches.flat()[0]).toMatchObject({ from: "JambaHR <noreply@jambahr.com>", subject: "Reminder: you haven't clocked in yet today" });
    expect(db.notifications.filter((n) => n.org_id === ORG).map((n) => n.employee_id).sort()).toEqual([ANUP, NOMAIL].sort());
    expect(db.notifications[0]).toMatchObject({ type: "attendance_reminder", data: { kind: "clock_in", date: "2026-10-15" } });
    const status = Object.fromEntries(db.attendance_reminder_log.map((r) => [r.employee_id, r.email_status]));
    expect(status[ANUP]).toBe("sent");
    expect(status[NOMAIL]).toBe("skipped_no_email");
  });

  it("never reminds twice — a repeat run in the window is a no-op", async () => {
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    const first = db.attendance_reminder_log.length;
    batches.length = 0;
    await runAttendanceReminders(createFakeSupabase(db), new Date("2026-10-15T05:00:00Z")); // 10:30
    expect(db.attendance_reminder_log).toHaveLength(first);
    expect(batches).toHaveLength(0);
  });

  it("evening: clock-out reminder only to people still clocked in", async () => {
    await runAttendanceReminders(createFakeSupabase(db), THU_1935_IST);
    expect(db.attendance_reminder_log.filter((r) => r.org_id === ORG).map((r) => [r.employee_id, r.kind])).toEqual([[PREM, "clock_out"]]);
  });

  it("does nothing outside the window, when off, or when attendance is off", async () => {
    await runAttendanceReminders(createFakeSupabase(db), new Date("2026-10-15T06:00:00Z")); // 11:30 IST
    expect(db.attendance_reminder_log).toHaveLength(0);

    db.organizations[0].settings = settings({ enabled: false });
    db.organizations[1].settings = { ...settings({}), attendance_enabled: false };
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    expect(db.attendance_reminder_log).toHaveLength(0);
  });

  it("respects the channel switches", async () => {
    db.organizations[0].settings = settings({ email: false, excluded_employee_ids: [SIDD] });
    db.organizations.pop();
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    expect(batches).toHaveLength(0);
    expect(db.notifications).toHaveLength(2);
    expect(db.attendance_reminder_log.every((r) => r.email_status === "skipped_disabled")).toBe(true);

    db.attendance_reminder_log = [];
    db.notifications = [];
    pushed.length = 0;
    db.organizations[0].settings = settings({ in_app: false, excluded_employee_ids: [SIDD] });
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    expect(db.notifications).toHaveLength(0);
    expect(pushed).toHaveLength(0);
  });

  it("a holiday skips the clock-in reminder", async () => {
    db.holidays = [{ org_id: ORG, date: "2026-10-15", is_optional: false }];
    db.organizations.pop();
    await runAttendanceReminders(createFakeSupabase(db), THU_1020_IST);
    expect(db.attendance_reminder_log).toHaveLength(0);
  });
});
