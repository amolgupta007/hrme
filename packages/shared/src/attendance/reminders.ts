/**
 * Clock-in / clock-out reminders — pure rules shared by the reminder job, the
 * settings card and the web notifications bell. No DB, no I/O.
 *
 * Stored at organizations.settings.attendance.reminders (snake_case). Times are
 * IST wall-clock "HH:MM" in 5-minute steps.
 */

export type ReminderKind = "clock_in" | "clock_out";

export type AttendanceReminderSettings = {
  enabled: boolean;
  clockIn: { enabled: boolean; time: string };
  clockOut: { enabled: boolean; time: string };
  email: boolean;
  inApp: boolean;
  excludedEmployeeIds: string[];
};

export const DEFAULT_REMINDER_SETTINGS: AttendanceReminderSettings = {
  enabled: false,
  clockIn: { enabled: true, time: "10:15" },
  clockOut: { enabled: true, time: "19:30" },
  email: true,
  inApp: true,
  excludedEmployeeIds: [],
};

/**
 * A missed run (deploy, outage) still catches up — but only this long after
 * the configured time. Nobody gets a "clock in" email in the afternoon.
 */
export const REMINDER_CATCH_UP_MINUTES = 60;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidReminderTime(t: unknown): t is string {
  return typeof t === "string" && TIME_RE.test(t) && Number(t.slice(3)) % 5 === 0;
}

export function minutesOfDay(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** "10:15" → "10:15 AM", "19:30" → "7:30 PM". */
export function formatReminderTime(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** IST calendar date and minutes past midnight for an instant. */
export function istClock(now: Date): { date: string; minutes: number } {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return { date: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** Reads the stored shape; anything missing or malformed falls back to the defaults. */
export function normalizeReminderSettings(orgSettings: unknown): AttendanceReminderSettings {
  const att = (orgSettings as { attendance?: unknown } | null)?.attendance;
  const r = (att && typeof att === "object" ? (att as Record<string, unknown>).reminders : null) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!r || typeof r !== "object") return { ...DEFAULT_REMINDER_SETTINGS, excludedEmployeeIds: [] };
  const d = DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: r.enabled === true,
    clockIn: {
      enabled: r.clock_in_enabled !== false,
      time: isValidReminderTime(r.clock_in_time) ? r.clock_in_time : d.clockIn.time,
    },
    clockOut: {
      enabled: r.clock_out_enabled !== false,
      time: isValidReminderTime(r.clock_out_time) ? r.clock_out_time : d.clockOut.time,
    },
    email: r.email !== false,
    inApp: r.in_app !== false,
    excludedEmployeeIds: Array.isArray(r.excluded_employee_ids)
      ? (r.excluded_employee_ids as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
  };
}

/** The stored (snake_case) form of the settings. */
export function serializeReminderSettings(s: AttendanceReminderSettings): Record<string, unknown> {
  return {
    enabled: s.enabled,
    clock_in_enabled: s.clockIn.enabled,
    clock_in_time: s.clockIn.time,
    clock_out_enabled: s.clockOut.enabled,
    clock_out_time: s.clockOut.time,
    email: s.email,
    in_app: s.inApp,
    excluded_employee_ids: [...new Set(s.excludedEmployeeIds)],
  };
}

/** Which reminders the job should send at `nowMinutes` (IST): configured time ≤ now < time + catch-up. */
export function dueReminderKinds(s: AttendanceReminderSettings, nowMinutes: number): ReminderKind[] {
  if (!s.enabled || (!s.email && !s.inApp)) return [];
  const due = (cfg: { enabled: boolean; time: string }) => {
    if (!cfg.enabled) return false;
    const at = minutesOfDay(cfg.time);
    return nowMinutes >= at && nowMinutes < at + REMINDER_CATCH_UP_MINUTES;
  };
  const kinds: ReminderKind[] = [];
  if (due(s.clockIn)) kinds.push("clock_in");
  if (due(s.clockOut)) kinds.push("clock_out");
  return kinds;
}

/** One employee's state today, as the reminder rules need it. */
export type ReminderCandidate = {
  excluded: boolean;
  /** Week-off (their effective policy) or a non-optional holiday. */
  nonWorkingToday: boolean;
  /** Any approved leave covering today, full or half day. */
  onLeaveToday: boolean;
  /** A clock-in exists today. */
  clockedIn: boolean;
  /** Clocked in and not clocked out (an open session). */
  sessionOpen: boolean;
};

/**
 * clock_in  → a working day for them, not on leave, and no clock-in yet.
 * clock_out → still clocked in, whatever the day (someone who came in on a
 *             week-off still needs to clock out).
 */
export function needsReminder(kind: ReminderKind, c: ReminderCandidate): boolean {
  if (c.excluded) return false;
  if (kind === "clock_out") return c.sessionOpen;
  return !c.nonWorkingToday && !c.onLeaveToday && !c.clockedIn;
}

/**
 * What the web bell should show right now: a reminder whose time has passed
 * today and still applies. No catch-up limit — it stays until they act.
 * Clock-out wins when both apply (they can't both: one needs a clock-in).
 */
export function activeReminderFor(
  s: AttendanceReminderSettings,
  nowMinutes: number,
  c: ReminderCandidate
): ReminderKind | null {
  if (!s.enabled || !s.inApp) return null;
  if (s.clockOut.enabled && nowMinutes >= minutesOfDay(s.clockOut.time) && needsReminder("clock_out", c)) {
    return "clock_out";
  }
  if (s.clockIn.enabled && nowMinutes >= minutesOfDay(s.clockIn.time) && needsReminder("clock_in", c)) {
    return "clock_in";
  }
  return null;
}
