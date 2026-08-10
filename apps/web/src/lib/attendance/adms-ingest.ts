/**
 * ADMS (ZKTeco / eSSL "push SDK") attendance ingest — multi-location attendance Phase 0.C.
 *
 * Turns a raw ATTLOG push body into neutral `attendance_punch_events`, then derives the
 * daily `attendance_records` rollup via the pure computeDailyAttendance() (PRD §4.2 / §5).
 *
 * Plain module (NOT "use server") — called from the public /iclock route handler, never
 * from a client. Uses the service-role admin client (RLS bypass, gotcha #5).
 *
 * Wire format observed from a live ZKTeco K40 Pro (firmware 8.0.4.3), tab-separated:
 *   <pin>\t<YYYY-MM-DD HH:MM:SS>\t<status>\t<verify>\t<workcode>\t<reserved...>
 * The timestamp is DEVICE-LOCAL (IST) — not UTC. We parse it as Asia/Kolkata.
 * Direction (in/out) is never trusted from `status`; it is derived as first-in/last-out.
 */

import { createAdminSupabase } from "@/lib/supabase/server";
import { computeDailyAttendance, type PunchEvent } from "./daily-attendance";
import { resolveEmployeeZoneLocationIds } from "./resolve-zone";
import { decideAttribution, type GroupMatch } from "./cross-org-resolution";
import { getSiblingOrgIds, assertSameGroup } from "./company-group";

const IST_OFFSET = "+05:30";
const DAY_MS = 24 * 60 * 60 * 1000;

export type AttlogPunch = {
  pin: string;
  localDateTime: string; // device-local "YYYY-MM-DD HH:MM:SS" (IST)
  status: string;
  verify: string;
  raw: string;
};

export type IngestResult = {
  ok: boolean;
  reason?: string;
  ingested: number;
  duplicates: number;
  unmatchedPins: string[];
  daysRecomputed: number;
};

/** Split an ATTLOG body into structured punches. Tolerant of CRLF and short lines. */
export function parseAttlog(body: string): AttlogPunch[] {
  const out: AttlogPunch[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split("\t");
    if (f.length < 2 || !f[0] || !f[1]) continue;
    out.push({
      pin: f[0].trim(),
      localDateTime: f[1].trim(),
      status: (f[2] ?? "").trim(),
      verify: (f[3] ?? "").trim(),
      raw: line,
    });
  }
  return out;
}

/** "2026-06-24 13:38:28" (IST local) → UTC ISO string, or null if unparseable. */
export function istLocalToUtcIso(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${IST_OFFSET}`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** IST calendar date of a device-local timestamp (its own date part). */
export function istDateOf(local: string): string | null {
  const m = local.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Resolve an org by its per-org device ingest token (security hardening). */
export async function resolveOrgByIngestToken(token: string): Promise<string | null> {
  if (!token) return null;
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("settings->>device_ingest_token" as any, token)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export async function ingestAttlog(
  serial: string,
  body: string,
  opts: { tokenProvided?: boolean; orgIdFromToken?: string | null } = {},
): Promise<IngestResult> {
  const base: IngestResult = {
    ok: true,
    ingested: 0,
    duplicates: 0,
    unmatchedPins: [],
    daysRecomputed: 0,
  };

  const punches = parseAttlog(body);
  if (punches.length === 0) return { ...base, reason: "empty" };

  const supabase = createAdminSupabase();

  // Resolve org + location from the pushing device's serial.
  const { data: device } = await supabase
    .from("devices")
    .select("id, org_id, location_id, is_active")
    .eq("device_serial", serial)
    .maybeSingle();

  if (!device) {
    console.warn(`[adms] unknown device serial ${serial} — ${punches.length} punch(es) dropped`);
    return { ...base, ok: false, reason: "unknown_device" };
  }
  // Security: a deactivated device stops being trusted immediately.
  if (!(device as any).is_active) {
    console.warn(`[adms] device ${serial} is inactive — ${punches.length} punch(es) dropped`);
    return { ...base, ok: false, reason: "inactive_device" };
  }
  const orgId = (device as any).org_id as string;
  const deviceId = (device as any).id as string;
  const locationId = (device as any).location_id as string | null;

  // Security: a token in the URL must belong to the same org as the serial.
  if (opts.orgIdFromToken && opts.orgIdFromToken !== orgId) {
    console.warn(`[adms] token/serial org mismatch for ${serial} — dropped`);
    return { ...base, ok: false, reason: "token_org_mismatch" };
  }
  // Security: orgs may require the token (reject plain serial-only pushes).
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if ((org as any)?.settings?.device_ingest_require_token === true && !opts.tokenProvided) {
    console.warn(`[adms] org ${orgId} requires an ingest token; serial-only push dropped`);
    return { ...base, ok: false, reason: "token_required" };
  }

  // Map PINs → employees (device_code) within the org, one round trip.
  // Exclude terminated employees so a stale PIN on a left employee doesn't
  // host-match (and, in a group, doesn't block cross-org resolution).
  const pins = [...new Set(punches.map((p) => p.pin))];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, device_code")
    .eq("org_id", orgId)
    .in("device_code", pins)
    .neq("status", "terminated");
  const pinToEmp = new Map<string, string>(
    (emps ?? []).map((e: any) => [String(e.device_code), e.id as string]),
  );

  // Cross-org (company group) resolution: for PINs with no employee in the
  // device's own org, search sibling group orgs by device_code. Only runs when
  // there are host-misses AND the org is grouped — ungrouped orgs are unchanged.
  const missPins = pins.filter((p) => !pinToEmp.has(p));
  const groupMatchesByPin = new Map<string, GroupMatch[]>();
  let siblingOrgIds: string[] = [];
  if (missPins.length > 0) {
    siblingOrgIds = await getSiblingOrgIds(supabase, orgId);
    if (siblingOrgIds.length > 0) {
      const { data: gemps } = await supabase
        .from("employees")
        .select("id, device_code, org_id")
        .in("org_id", siblingOrgIds)
        .in("device_code", missPins)
        .neq("status", "terminated");
      for (const e of (gemps ?? []) as any[]) {
        const pin = String(e.device_code);
        const arr = groupMatchesByPin.get(pin) ?? [];
        arr.push({ employeeId: e.id as string, orgId: e.org_id as string });
        groupMatchesByPin.set(pin, arr);
      }
    }
  }
  const isGrouped = siblingOrgIds.length > 0;

  const affected = new Set<string>(); // `${orgId}|${employeeId}|${istDate}` (org = payroll org)
  const unmatched = new Set<string>();

  for (const p of punches) {
    const punchedAt = istLocalToUtcIso(p.localDateTime);
    const istDate = istDateOf(p.localDateTime);
    if (!punchedAt || !istDate) continue;

    // Host-org match first (also makes dual-employment safe).
    const hostEmp = pinToEmp.get(p.pin);
    if (hostEmp) {
      const { error } = await supabase.from("attendance_punch_events").insert({
        org_id: orgId,
        employee_id: hostEmp,
        device_id: deviceId,
        location_id: locationId,
        punched_at: punchedAt,
        source: "adms",
        raw_payload: { line: p.raw, serial, status: p.status, verify: p.verify },
      });
      if (error) {
        if ((error as any).code === "23505" || /duplicate/i.test(error.message)) base.duplicates++;
        else {
          console.error("[adms] punch insert failed:", error.message);
          continue;
        }
      } else {
        base.ingested++;
      }
      affected.add(`${orgId}|${hostEmp}|${istDate}`);
      continue;
    }

    // Host miss → resolve across the company group.
    const decision = decideAttribution(null, groupMatchesByPin.get(p.pin) ?? []);

    if (decision.status === "attributed") {
      const payrollOrgId = decision.payrollOrgId;
      const guestEmp = decision.employeeId;
      // Defensive gate: only stamp a cross-org punch when both orgs share a group.
      if (!(await assertSameGroup(supabase, payrollOrgId, orgId))) {
        console.warn(`[adms] cross-org gate failed ${orgId}→${payrollOrgId}; punch dropped`);
        continue;
      }
      const { data: ins, error } = await supabase
        .from("attendance_punch_events")
        .insert({
          org_id: payrollOrgId, // attribute to the payroll org
          employee_id: guestEmp,
          device_id: deviceId, // host device
          location_id: locationId, // host location
          punched_at: punchedAt,
          source: "adms",
          raw_payload: {
            line: p.raw,
            serial,
            status: p.status,
            verify: p.verify,
            cross_org_host: orgId,
          },
        })
        .select("id")
        .single();
      if (error) {
        if ((error as any).code === "23505" || /duplicate/i.test(error.message)) {
          base.duplicates++;
          affected.add(`${payrollOrgId}|${guestEmp}|${istDate}`);
        } else {
          console.error("[adms] cross-org punch insert failed:", error.message);
        }
        continue;
      }
      base.ingested++;
      affected.add(`${payrollOrgId}|${guestEmp}|${istDate}`);
      // Host-org visibility log (best-effort; unique on punch_event_id → resend-safe).
      const { error: gErr } = await supabase.from("guest_punch_logs").insert({
        host_org_id: orgId,
        guest_org_id: payrollOrgId,
        guest_employee_id: guestEmp,
        device_id: deviceId,
        location_id: locationId,
        punched_at: punchedAt,
        punch_event_id: (ins as { id: string }).id,
        pin: p.pin,
      });
      if (gErr && !/duplicate/i.test(gErr.message))
        console.warn("[adms] guest log insert failed:", gErr.message);
      continue;
    }

    if (decision.status === "ambiguous") {
      // Same PIN in >1 group org — never guess. Queue for review (resend-safe).
      const { error: uErr } = await supabase.from("unresolved_punches").insert({
        host_org_id: orgId,
        device_id: deviceId,
        pin: p.pin,
        punched_at: punchedAt,
        reason: "ambiguous_group_pin",
        candidate_org_ids: decision.candidateOrgIds,
      });
      if (uErr && !/duplicate/i.test(uErr.message))
        console.warn("[adms] unresolved insert failed:", uErr.message);
      continue;
    }

    // Unmatched: unchanged for ungrouped orgs. For grouped orgs, log a review row
    // so a guest arriving with an unknown PIN is visible (resend-safe).
    unmatched.add(p.pin);
    if (isGrouped) {
      const { error: uErr } = await supabase.from("unresolved_punches").insert({
        host_org_id: orgId,
        device_id: deviceId,
        pin: p.pin,
        punched_at: punchedAt,
        reason: "no_group_match",
        candidate_org_ids: null,
      });
      if (uErr && !/duplicate/i.test(uErr.message))
        console.warn("[adms] unresolved insert failed:", uErr.message);
    }
  }

  for (const key of affected) {
    const [recomputeOrgId, employeeId, istDate] = key.split("|");
    await recomputeAttendanceDay(supabase, recomputeOrgId, employeeId, istDate);
  }

  // Liveness for the Settings connection-status indicator.
  const nowIso = new Date().toISOString();
  await supabase
    .from("devices")
    .update({ last_seen_at: nowIso, ...(base.ingested > 0 ? { last_punch_at: nowIso } : {}) })
    .eq("id", deviceId);

  base.unmatchedPins = [...unmatched];
  base.daysRecomputed = affected.size;
  return base;
}

/**
 * Mark a known device as alive from a non-punch contact (handshake / command poll).
 * Throttled to ~1 write/min so the device's ~2s getrequest poll doesn't hammer the DB.
 * Unknown serials are a no-op (the WHERE matches nothing).
 */
export async function touchDeviceSeen(serial: string): Promise<void> {
  if (!serial) return;
  const supabase = createAdminSupabase();
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  await supabase
    .from("devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("device_serial", serial)
    .eq("is_active", true)
    .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`);
}

/**
 * Derive the daily attendance_records rollup for one (employee, IST day) from its events.
 * Exported so a manual "recalculate day" admin action can reuse the exact same logic.
 */
export async function recomputeAttendanceDay(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  employeeId: string,
  istDate: string,
): Promise<void> {
  const start = new Date(`${istDate}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + DAY_MS);

  const { data: allEvents } = await supabase
    .from("attendance_punch_events")
    .select("id, punched_at, location_id, status, source")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .gte("punched_at", start.toISOString())
    .lt("punched_at", end.toISOString())
    .order("punched_at", { ascending: true });

  const rows = (allEvents ?? []) as (PunchEvent & { status?: string | null })[];
  // Only approved punches count toward the rollup; pending/rejected/voided/duplicate are excluded.
  const approved = rows.filter((r) => (r.status ?? "approved") === "approved");
  const hasPending = rows.some((r) => r.status === "pending");

  // Phase 1: pool only punches from the employee's zone for that day.
  // null = unassigned → pool all of the employee's punches (no-zone fallback).
  const zoneLocationIds = await resolveEmployeeZoneLocationIds(
    supabase,
    orgId,
    employeeId,
    istDate,
  );

  const result = computeDailyAttendance({
    events: approved as PunchEvent[],
    zoneLocationIds,
  });

  // An absent day with no pending punches has nothing to record.
  if (result.status === "absent" && !hasPending) return;

  // Rollup source label (attendance_records.source CHECK allows web/device/auto_close/mobile).
  // A biometric/ADMS punch on the day makes it a 'device' day; a pure-mobile day is 'mobile';
  // otherwise (manual/web/legacy events) keep the historical 'device' default.
  const hasDeviceOrAdms = rows.some((r) => r.source === "device" || r.source === "adms");
  const hasMobile = rows.some((r) => r.source === "mobile");
  const rollupSource: "device" | "mobile" =
    hasDeviceOrAdms ? "device" : hasMobile ? "mobile" : "device";

  const { error } = await supabase.from("attendance_records").upsert(
    {
      org_id: orgId,
      employee_id: employeeId,
      date: istDate,
      clock_in_at: result.firstInAt,
      clock_out_at: result.lastOutAt,
      total_minutes: result.totalMinutes,
      worked_minutes: result.workedMinutes,
      break_minutes: result.breakMinutes,
      needs_review: result.needsReview || hasPending,
      has_pending_punches: hasPending,
      source: rollupSource, // 'device' if any device/adms punch that day, else 'mobile' (migration 102)
      // Phase 2 multi-location rollup fields (derived from the event stream).
      first_in_location_id: result.firstInLocationId,
      last_out_location_id: result.lastOutLocationId,
      punch_count: result.punchCount,
      out_of_zone_count: result.outOfZoneCount,
      derived_status: result.status,
    },
    { onConflict: "org_id,employee_id,date" },
  );

  if (error) console.error("[adms] rollup upsert failed:", error.message);
}
