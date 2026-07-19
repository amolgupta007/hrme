/**
 * Mobile BFF DTOs for the Staff MVP attendance/home screens (Mobile PRD-02,
 * Phase D Slice 1, Task 3). The mobile app and the `/api/mobile/*` route
 * handlers both import from here — these types are the wire contract.
 *
 * Types only. No runtime logic (Zod validation lives web-side in
 * apps/web/src/lib/mobile/*). See docs/prds/mobile/02-PRD-Staff-MVP.md.
 */
import type { MonthDay } from "../attendance/month-calendar";

/**
 * The signed-in employee's live attendance status for today. Shared by the
 * Home card (`MobileHomeResponse.today`) and the punch response — a punch
 * returns the fresh version of exactly this shape.
 */
export type MobileTodayStatus = {
  isClockedIn: boolean;
  clockInAt: string | null;
  clockOutAt: string | null;
  minutesToday: number | null;
  shift: { name: string; start: string; end: string } | null;
};

export type MobileLeaveBalance = {
  policyId: string;
  name: string;
  type: string;
  total: number;
  used: number;
  remaining: number;
};

export type MobileHolidayLite = {
  date: string; // YYYY-MM-DD
  name: string;
  is_optional: boolean;
};

export type MobileHomeResponse = {
  today: MobileTodayStatus;
  leave: {
    balances: MobileLeaveBalance[];
  };
  /** Up to 3 upcoming holidays (today or later), soonest first. */
  nextHolidays: MobileHolidayLite[];
  pending: {
    leaveRequests: number;
    regularizations: number;
  };
};

/** Per-day punch detail for the calendar tap-through. */
export type MobileAttendanceDayDetail = {
  date: string; // YYYY-MM-DD (IST attendance day)
  pairs: { in: string | null; out: string | null }[];
  source: string | null;
  autoClosed: boolean;
  outOfZoneCount: number;
};

export type MobileAttendanceMonthResponse = {
  month: string; // YYYY-MM
  days: MonthDay[];
  details: MobileAttendanceDayDetail[];
  /**
   * IST dates (YYYY-MM-DD) in this month that carry a pending regularization —
   * i.e. at least one `attendance_punch_events` row with `status:'pending'`
   * awaiting admin approval. The calendar day-detail sheet renders a "Pending"
   * chip for these; the day's calendar state is UNCHANGED (pending punches
   * never count toward the rollup until approved).
   */
  pendingRegularizationDates: string[];
};

export type MobilePunchRequest = {
  clientEventId: string; // uuid, client-minted for offline-replay idempotency
  punchedAt: string; // ISO 8601 (UTC or with offset)
  lat?: number | null;
  lng?: number | null;
};

export type MobilePunchResponse = {
  today: MobileTodayStatus;
};

/**
 * Regularization request (Phase D Slice 1, Task 7): an employee proposes the
 * in (and optional out) punch they missed on a PAST day, with a reason. The
 * BFF records them as pending `attendance_punch_events` (source 'mobile') that
 * the existing web admin punch-review queue approves. Times are full ISO-8601
 * instants (built client-side from the day + IST wall-clock) that MUST fall on
 * the IST calendar day named by `date`.
 */
export type MobileRegularizeRequest = {
  date: string; // YYYY-MM-DD (IST) — a past day, not today/future
  proposedIn: string; // ISO 8601 with offset
  proposedOut: string | null; // ISO 8601 with offset, or null (in-only)
  reason: string;
};

export type MobileRegularizeResponse = {
  ok: true;
  /** How many pending punch events were created (1 = in-only, 2 = in + out). */
  eventsCreated: number;
};
