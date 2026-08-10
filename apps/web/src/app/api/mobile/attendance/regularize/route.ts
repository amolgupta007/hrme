import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { istToday, type MobileRegularizeResponse } from "@jambahr/shared";
import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";
import { RegularizeBodySchema, validateRegularization } from "@/lib/mobile/regularize";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: submit a regularization request for a PAST day. The proposed
 * in/out land as PENDING `attendance_punch_events` (source 'mobile') that the
 * existing web admin punch-review queue (Locations tab → punch timeline →
 * approve) resolves. No new table, no new review surface.
 *
 * `recomputeAttendanceDay` runs after insert — NOT to fold the pending events
 * into the rollup (it counts only `approved` events, so the day's hours/status
 * are unchanged) but so the day's rollup row exists and is flagged
 * `has_pending_punches`/`needs_review`, which is what makes an absent-day
 * regularization visible in the admin review queue. On approve, the same
 * recompute path folds the now-approved events in.
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
  const parsed = RegularizeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }
  const { date, proposedIn, proposedOut, reason } = parsed.data;

  const supabase = createAdminSupabase();

  // Employee must still be active in this org; date_of_joining bounds the range.
  const { data: emp } = await supabase
    .from("employees")
    .select("status, date_of_joining")
    .eq("id", employeeId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!emp || (emp as { status?: string }).status === "terminated") {
    return NextResponse.json({ error: "inactive_employee" }, { status: 403 });
  }

  const validation = validateRegularization({
    date,
    proposedIn,
    proposedOut: proposedOut ?? null,
    todayIst: istToday(),
    dateOfJoining: (emp as { date_of_joining?: string | null }).date_of_joining ?? null,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const rows = validation.events.map((e) => ({
    org_id: user.orgId,
    employee_id: employeeId,
    device_id: null,
    location_id: null,
    punched_at: e.punchedAtIso,
    source: "mobile",
    punch_type: e.punchType,
    status: "pending",
    created_by: employeeId,
    note: reason,
    raw_payload: { mobile: true, regularization: true },
    // Cast: generated Supabase types predate migration 102 (source 'mobile') →
    // insert arg infers `never` (gotcha #3). Matches the punch route idiom.
  }));

  // Both rows go through ONE insert statement, so Postgres applies it
  // atomically — a unique violation on either row persists NEITHER (no
  // partial IN-only state to clean up).
  const { error: insertErr } = await supabase
    .from("attendance_punch_events")
    .insert(rows as never);
  if (insertErr) {
    // 23505 on uq_punch_events_dedupe (078): with device_id null the key
    // collapses to (org, employee, punched_at) — an existing event at exactly
    // that instant (e.g. a previously REJECTED correction) blocks the insert.
    // Deliberately NOT idempotent-success like the punch route: a resubmit
    // after rejection wants a genuinely NEW pending row, so claiming success
    // would falsely tell the user "pending". Deterministic 409 instead; the
    // client asks the user to nudge the time.
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "duplicate_time" }, { status: 409 });
    }
    // Never leak the raw DB error message to the client.
    console.error("[mobile/regularize] insert failed:", insertErr.message);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Surface the pending punches in the admin review queue (flags the rollup
  // row) without changing the day's computed attendance — recompute excludes
  // pending events.
  await recomputeAttendanceDay(supabase, user.orgId, employeeId, date);

  const payload: MobileRegularizeResponse = { ok: true, eventsCreated: rows.length };
  return NextResponse.json(payload);
}
