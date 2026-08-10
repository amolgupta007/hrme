/**
 * Pure, idempotent daily-attendance computation for multi-location (zone) attendance.
 *
 * Reads a flat list of neutral punch EVENTS for one employee on one attendance day
 * and derives the single daily rollup: first-in -> last-out, gap included.
 * No DB, no device, no I/O — see PRD §4.2 (docs/prds/multi-location-attendance.md).
 *
 * Direction (IN/OUT) is never trusted from the device; it is derived as
 * min(punched_at) = first-in, max(punched_at) = last-out.
 *
 * `totalMinutes` remains the gross span (last−first, break included) for
 * back-compat. `workedMinutes`/`breakMinutes` come from chronological interval
 * pairing (see pair-punches.ts) — worked time with breaks excluded.
 */
import { pairPunches } from "./pair-punches";

/** Mirrors the attendance_punch_events.source CHECK constraint (migration 102). */
export type PunchSource = "web" | "device" | "manual" | "adms" | "mobile";

export type PunchEvent = {
  id: string;
  punched_at: string; // ISO 8601 (UTC)
  location_id: string | null;
  /**
   * Optional for back-compat — existing call sites (e.g. the ADMS ingest path,
   * which doesn't select this column) omit it entirely and get the pre-existing
   * zone-exclusion behavior. Only `'mobile'` changes behavior (see below).
   */
  source?: PunchSource;
};

export type DailyAttendanceStatus = "present" | "incomplete" | "absent";

export type DailyAttendanceResult = {
  status: DailyAttendanceStatus;
  /** last_out − first_in in whole minutes (gross span, break included); null when not present. */
  totalMinutes: number | null;
  /** Σ(out−in) over paired intervals — worked time with breaks excluded; null when not present. */
  workedMinutes: number | null;
  /** Σ gaps between paired intervals; null when not present. */
  breakMinutes: number | null;
  /** True on odd-count (missed-punch) days or when no pair could be formed. */
  needsReview: boolean;
  firstInAt: string | null;
  lastOutAt: string | null;
  firstInLocationId: string | null;
  lastOutLocationId: string | null;
  /** Count of in-zone punches that contributed. */
  punchCount: number;
  /** Ids of the in-zone punches, ascending by time (audit trail). */
  contributingIds: string[];
  /** Punches dropped because their location was outside the zone. */
  outOfZoneCount: number;
  /** True when no zone was resolved and we fell back to all locations. */
  noZoneFallback: boolean;
};

/**
 * Collapse duplicate punches (same location, within `windowSeconds`) that the
 * same physical scan can produce. Keeps the earliest of each cluster. Punches at
 * DIFFERENT locations are never merged, even if simultaneous.
 */
export function dedupePunches(events: PunchEvent[], windowSeconds: number): PunchEvent[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );
  const kept: PunchEvent[] = [];
  for (const e of sorted) {
    const dup = kept.find(
      (k) =>
        k.location_id === e.location_id &&
        Math.abs(new Date(e.punched_at).getTime() - new Date(k.punched_at).getTime()) <=
          windowSeconds * 1000,
    );
    if (!dup) kept.push(e);
  }
  return kept;
}

export function computeDailyAttendance(params: {
  events: PunchEvent[];
  /** Location ids in the employee's zone for that day, or null = no zone assigned. */
  zoneLocationIds: string[] | null;
  /** Dedupe window in seconds; 0 disables. Default 60. */
  dedupeWindowSeconds?: number;
}): DailyAttendanceResult {
  const { events, zoneLocationIds, dedupeWindowSeconds = 60 } = params;

  const empty: DailyAttendanceResult = {
    status: "absent",
    totalMinutes: null,
    workedMinutes: null,
    breakMinutes: null,
    needsReview: false,
    firstInAt: null,
    lastOutAt: null,
    firstInLocationId: null,
    lastOutLocationId: null,
    punchCount: 0,
    contributingIds: [],
    outOfZoneCount: 0,
    noZoneFallback: zoneLocationIds === null,
  };

  if (!events || events.length === 0) return empty;

  const deduped = dedupeWindowSeconds > 0 ? dedupePunches(events, dedupeWindowSeconds) : events;

  // No zone assigned → fall back to ALL locations (PRD §4.4) and flag it.
  const noZoneFallback = zoneLocationIds === null;
  // Mobile GPS punches are exempt from zone filtering (lenient — field staff
  // punching at client sites aren't "out of zone"; see 02A-PHASE-D-DECISIONS.md
  // decision 3). All other sources (including no source, e.g. legacy/ADMS
  // events that don't select this column) keep the original zone check.
  const inZone = noZoneFallback
    ? deduped
    : deduped.filter(
        (e) =>
          e.source === "mobile" ||
          (e.location_id !== null && zoneLocationIds!.includes(e.location_id)),
      );
  const outOfZoneCount = deduped.length - inZone.length;

  if (inZone.length === 0) {
    return { ...empty, outOfZoneCount, noZoneFallback };
  }

  const sorted = [...inZone].sort(
    (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
  );
  const firstIn = sorted[0];
  const lastOut = sorted[sorted.length - 1];
  const contributingIds = sorted.map((e) => e.id);

  // Single punch → incomplete (no pair to bound hours).
  if (sorted.length === 1) {
    return {
      status: "incomplete",
      totalMinutes: null,
      workedMinutes: null,
      breakMinutes: null,
      needsReview: true,
      firstInAt: firstIn.punched_at,
      lastOutAt: null,
      firstInLocationId: firstIn.location_id,
      lastOutLocationId: null,
      punchCount: 1,
      contributingIds,
      outOfZoneCount,
      noZoneFallback,
    };
  }

  const totalMinutes = Math.round(
    (new Date(lastOut.punched_at).getTime() - new Date(firstIn.punched_at).getTime()) / 60_000,
  );

  // Net worked time (breaks excluded) via chronological interval pairing.
  const paired = pairPunches(sorted.map((e) => ({ id: e.id, punched_at: e.punched_at })));

  return {
    status: "present",
    totalMinutes,
    workedMinutes: paired.workedMinutes,
    breakMinutes: paired.breakMinutes,
    needsReview: paired.needsReview,
    firstInAt: firstIn.punched_at,
    lastOutAt: lastOut.punched_at,
    firstInLocationId: firstIn.location_id,
    lastOutLocationId: lastOut.location_id,
    punchCount: sorted.length,
    contributingIds,
    outOfZoneCount,
    noZoneFallback,
  };
}
