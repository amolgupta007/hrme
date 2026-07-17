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
