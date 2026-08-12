import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { istDateOf } from "@jambahr/shared";
import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";
import { PunchBodySchema, isWithinClockSkew } from "@/lib/mobile/punch";
import { loadTodayStatus } from "@/lib/mobile/attendance-queries";
import {
  loadLocationPunchSettings,
  resolvePunchLocation,
  UNRESOLVED_LOCATION,
} from "@/lib/attendance/location-punch";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: record a staff punch. Punches enter the neutral
 * attendance_punch_events stream (source 'mobile') and the daily rollup is
 * re-derived via recomputeAttendanceDay — NEVER a direct attendance_records
 * write (avoids the web clockIn last-writer-wins contention). Offline replays
 * are idempotent on `client_event_id`.
 */
export async function POST(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }
  if (!user.attendanceEnabled) {
    return NextResponse.json({ error: "attendance_disabled" }, { status: 403 });
  }
  if (!user.employeeId) {
    return NextResponse.json({ error: "no_employee" }, { status: 403 });
  }
  const employeeId = user.employeeId;

  const body = await request.json().catch(() => null);
  const parsed = PunchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }
  const { clientEventId, punchedAt, lat, lng, accuracyM } = parsed.data;

  if (!isWithinClockSkew(punchedAt, Date.now())) {
    return NextResponse.json({ error: "clock_skew" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  // Location-verified clock-in (org opt-in). When the feature is off this is a
  // single settings read and nothing else changes about the punch path.
  const locationPunch = await loadLocationPunchSettings(supabase, user.orgId);
  const hasCoords = lat !== null && lat !== undefined && lng !== null && lng !== undefined;

  // `required` mode is the ONLY case where location can block a punch, and it is
  // an explicit admin choice. Rejected before any write so the client can retry
  // with coordinates against a clean slate.
  if (locationPunch.enabled && locationPunch.mode === "required" && !hasCoords) {
    return NextResponse.json({ error: "location_required" }, { status: 400 });
  }

  // Employee must still be active in this org.
  const { data: emp } = await supabase
    .from("employees")
    .select("status")
    .eq("id", employeeId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!emp || (emp as any).status === "terminated") {
    return NextResponse.json({ error: "inactive_employee" }, { status: 403 });
  }

  const punchedAtIso = new Date(punchedAt).toISOString();
  const istDate = istDateOf(punchedAtIso);

  // Office-vs-remote is decided HERE, from the org's geofences — never taken
  // from the client. Best-effort by construction: `resolvePunchLocation` never
  // throws and collapses to "not evaluated" on any failure, so a Mapbox outage
  // costs a label, not a punch.
  const geo = locationPunch.enabled
    ? await resolvePunchLocation(supabase, user.orgId, { lat, lng, accuracyM }, locationPunch)
    : UNRESOLVED_LOCATION;

  const { error: insertErr } = await supabase.from("attendance_punch_events").insert({
    org_id: user.orgId,
    employee_id: employeeId,
    device_id: null,
    location_id: null,
    punched_at: punchedAtIso,
    source: "mobile",
    punch_type: null, // direction is derived (first-in/last-out), never trusted
    status: "approved",
    client_event_id: clientEventId,
    lat: lat ?? null,
    lng: lng ?? null,
    accuracy_m: accuracyM ?? null,
    geo_status: geo.geo_status,
    matched_location_id: geo.matched_location_id,
    geo_label: geo.geo_label,
    created_by: employeeId,
    raw_payload: { mobile: true, client_event_id: clientEventId },
    // Cast: generated Supabase types predate migrations 102 (client_event_id/lat/lng,
    // source 'mobile') and 107 (accuracy_m/geo_*) → insert arg infers `never`
    // (gotcha #3). Matches the ownership/social idiom.
  } as never);

  // Note: a 23505 replay deliberately does NOT update the geo columns. The stored
  // row already carries the verdict resolved where the punch actually happened,
  // which is the truth we want — not wherever the phone was when it reconnected.

  // 23505 on uq_punch_events_client_event = offline replay of a punch we already
  // recorded → idempotent SUCCESS. Any other insert error is a real failure.
  if (insertErr && insertErr.code !== "23505") {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await recomputeAttendanceDay(supabase, user.orgId, employeeId, istDate);

  const today = await loadTodayStatus(supabase, user.orgId, employeeId, istDate);
  return NextResponse.json({ today });
}
