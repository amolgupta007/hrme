/**
 * Tiny IST (Asia/Kolkata, UTC+05:30) date helpers, shared by web + mobile.
 *
 * India has no DST, so a fixed +05:30 offset is exact. Centralised here so the
 * BFF routes stop repeating the ad-hoc `new Date(Date.now() + 5.5h)` pattern
 * scattered through apps/web (see attendance.ts:123,191,232,298).
 *
 * No DB, no I/O — pure.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar date (YYYY-MM-DD) that a UTC instant falls on. */
export function istDateOf(utcIso: string): string {
  return new Date(new Date(utcIso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's IST calendar date (YYYY-MM-DD). `nowMs` overridable for tests. */
export function istToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}
