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
  /**
   * Location verdict for the employee's most recent punch today, when the org
   * has Location-verified clock-in on and coordinates were resolved. `null`
   * means "not evaluated" (feature off, permission denied, no geofences set up,
   * or resolution failed) — never render it as "remote".
   */
  lastPunchGeo: MobilePunchGeo | null;
};

/**
 * The SERVER-resolved location verdict for one punch. The client sends only
 * raw coordinates; office-vs-remote is decided server-side against the org's
 * geofences, so a client can never claim it was at the office.
 */
export type MobilePunchGeo = {
  status: "office" | "remote";
  /** "Head Office" when at an office; "Andheri East, Mumbai" when remote. */
  label: string | null;
  /** Set only when `status === 'office'`. */
  siteName: string | null;
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

/** Latest org-wide announcement, trimmed for the Home card (2a design). */
export type MobileAnnouncementLite = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  createdAt: string;
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
  /**
   * Leave requests pending the caller's decision (manager-scope ∪ direct
   * reports, admin = org-wide). `null` for employees — hides the "to
   * approve" stat cell (2a design: center stat is manager-only).
   */
  pendingApprovals: number | null;
  /**
   * Count of the caller's own `training_enrollments.status = 'overdue'`
   * rows. Always present (cheap indexed count) — never `null`/faked.
   */
  trainingsOverdue: number;
  /** Latest ≤3 org announcements, pinned first then newest. */
  announcements: MobileAnnouncementLite[];
  /** Caller's total unread `notifications` count, for the Home bell badge. */
  unreadNotifications: number;
  /**
   * Org situational awareness for managers/admins (Mobile D4 Task 5): today's
   * attendance mix, the unified pending-approvals badge (mirrors
   * `GET /api/mobile/approvals` exactly — same fetchers), and the current
   * payroll cycle's status. `undefined` for employees AND whenever any
   * sub-computation throws — best-effort, the rest of Home stays intact.
   */
  adminHome?: {
    today: { present: number; absent: number; late: number };
    pendingApprovals: {
      total: number;
      byType: { leave: number; regularization: number; ot: number; payroll: number };
    };
    /**
     * The org's current-cycle (this IST calendar month) payroll run status.
     * `null` when the org's plan doesn't include payroll (module unavailable,
     * distinct from `{status:'none'}` = payroll available but no run yet).
     */
    payroll: {
      status: "none" | "draft" | "processing" | "awaiting_approval" | "paid";
      month?: string;
    } | null;
  };
};

/** Per-day punch detail for the calendar tap-through. */
export type MobileAttendanceDayDetail = {
  date: string; // YYYY-MM-DD (IST attendance day)
  pairs: { in: string | null; out: string | null }[];
  source: string | null;
  autoClosed: boolean;
  outOfZoneCount: number;
  /**
   * Distinct location verdicts across the day's punches, in punch order.
   *
   * A list rather than one value per pair, because clocking in at the office
   * and out from home is normal and both facts are worth showing — while
   * pairing (`pairs`) is derived first-in/last-out and doesn't map 1:1 onto
   * individual punch events. Empty when nothing was evaluated.
   */
  geo: MobilePunchGeo[];
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
  /**
   * GPS accuracy radius in metres, as reported by the device. Lets the server
   * give a low-confidence fix the benefit of the doubt at a geofence edge
   * (capped server-side so a garbage fix can't fake an office match).
   */
  accuracyM?: number | null;
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
