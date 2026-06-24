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

export async function ingestAttlog(serial: string, body: string): Promise<IngestResult> {
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
  const orgId = (device as any).org_id as string;
  const deviceId = (device as any).id as string;
  const locationId = (device as any).location_id as string | null;

  // Map PINs → employees (device_code) within the org, one round trip.
  const pins = [...new Set(punches.map((p) => p.pin))];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, device_code")
    .eq("org_id", orgId)
    .in("device_code", pins);
  const pinToEmp = new Map<string, string>(
    (emps ?? []).map((e: any) => [String(e.device_code), e.id as string]),
  );

  const affected = new Set<string>(); // `${employeeId}|${istDate}`
  const unmatched = new Set<string>();

  for (const p of punches) {
    const employeeId = pinToEmp.get(p.pin);
    if (!employeeId) {
      unmatched.add(p.pin);
      continue;
    }
    const punchedAt = istLocalToUtcIso(p.localDateTime);
    const istDate = istDateOf(p.localDateTime);
    if (!punchedAt || !istDate) continue;

    const { error } = await supabase.from("attendance_punch_events").insert({
      org_id: orgId,
      employee_id: employeeId,
      device_id: deviceId,
      location_id: locationId,
      punched_at: punchedAt,
      source: "adms",
      raw_payload: { line: p.raw, serial, status: p.status, verify: p.verify },
    });

    if (error) {
      // 23505 = duplicate (device resends all logs on reboot) → expected no-op.
      if ((error as any).code === "23505" || /duplicate/i.test(error.message)) {
        base.duplicates++;
      } else {
        console.error("[adms] punch insert failed:", error.message);
        continue;
      }
    } else {
      base.ingested++;
    }
    affected.add(`${employeeId}|${istDate}`);
  }

  for (const key of affected) {
    const [employeeId, istDate] = key.split("|");
    await recomputeDay(supabase, orgId, employeeId, istDate);
  }

  base.unmatchedPins = [...unmatched];
  base.daysRecomputed = affected.size;
  return base;
}

/** Derive the daily attendance_records rollup for one (employee, IST day) from its events. */
async function recomputeDay(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  employeeId: string,
  istDate: string,
): Promise<void> {
  const start = new Date(`${istDate}T00:00:00${IST_OFFSET}`);
  const end = new Date(start.getTime() + DAY_MS);

  const { data: events } = await supabase
    .from("attendance_punch_events")
    .select("id, punched_at, location_id")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .gte("punched_at", start.toISOString())
    .lt("punched_at", end.toISOString())
    .order("punched_at", { ascending: true });

  const result = computeDailyAttendance({
    events: (events ?? []) as PunchEvent[],
    zoneLocationIds: null, // Phase 0: no zones yet — pool all of the employee's punches
  });

  if (result.status === "absent") return;

  const { error } = await supabase.from("attendance_records").upsert(
    {
      org_id: orgId,
      employee_id: employeeId,
      date: istDate,
      clock_in_at: result.firstInAt,
      clock_out_at: result.lastOutAt,
      total_minutes: result.totalMinutes,
      source: "device", // attendance_records.source CHECK only allows web/device/auto_close
    },
    { onConflict: "org_id,employee_id,date" },
  );

  if (error) console.error("[adms] rollup upsert failed:", error.message);
}
