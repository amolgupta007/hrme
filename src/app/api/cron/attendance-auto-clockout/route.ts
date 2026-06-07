import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

const DEFAULT_STANDARD_WORKDAY_HOURS = 8;

// Today's date in IST as YYYY-MM-DD. Records whose `date` is < this value are
// considered prior-day shifts that need closing.
function todayInIST(): string {
  const utcMs = Date.now();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

// End of the given YYYY-MM-DD in IST, expressed as a UTC ISO string.
// "23:59:00 IST" of 2026-05-08 -> 2026-05-08T18:29:00Z.
function endOfDateIST(dateStr: string): Date {
  const eodIstMs = new Date(`${dateStr}T23:59:00.000Z`).getTime() - 5.5 * 60 * 60 * 1000;
  return new Date(eodIstMs);
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const today = todayInIST();

  // Pull every open shift older than today-IST (one query, batch-close in JS).
  const { data: openRows, error: queryErr } = await supabase
    .from("attendance_records")
    .select("id, org_id, date, clock_in_at, shift_id")
    .is("clock_out_at", null)
    .not("clock_in_at", "is", null)
    .lt("date", today);

  if (queryErr) {
    console.error("attendance-auto-clockout: query failed", queryErr);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  const rows = (openRows ?? []) as Array<{
    id: string;
    org_id: string;
    date: string;
    clock_in_at: string;
    shift_id: string | null;
  }>;

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, closedCount: 0, perOrg: {} });
  }

  // Look up each unique org's settings once.
  const uniqueOrgIds = [...new Set(rows.map((r) => r.org_id))];
  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, settings")
    .in("id", uniqueOrgIds);

  if (orgErr) {
    console.error("attendance-auto-clockout: org settings fetch failed", orgErr);
    return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  const settingsByOrg = new Map<string, { enabled: boolean; hours: number }>();
  for (const org of orgs ?? []) {
    const o = org as { id: string; settings: any };
    const enabled = !!o.settings?.attendance_enabled;
    const rawHours = o.settings?.attendance?.standard_workday_hours;
    const hours =
      typeof rawHours === "number" && Number.isFinite(rawHours)
        ? Math.max(1, Math.min(16, rawHours))
        : DEFAULT_STANDARD_WORKDAY_HOURS;
    settingsByOrg.set(o.id, { enabled, hours });
  }

  // New: load all referenced shifts in one round-trip.
  const shiftIds = Array.from(new Set(rows.map((r) => (r as any).shift_id).filter(Boolean))) as string[];
  const shiftsById = new Map<string, { total_hours: number }>();
  if (shiftIds.length > 0) {
    const { data: shiftRows } = await supabase.from("shifts").select("id, total_hours").in("id", shiftIds);
    for (const s of (shiftRows ?? []) as any[]) shiftsById.set(s.id, { total_hours: Number(s.total_hours) });
  }

  // Compute and apply per-record updates.
  let closedCount = 0;
  let skippedDisabled = 0;
  const failures: Array<{ id: string; error: string }> = [];
  const perOrg: Record<string, number> = {};

  for (const row of rows) {
    const orgConfig = settingsByOrg.get(row.org_id);
    if (!orgConfig || !orgConfig.enabled) {
      skippedDisabled++;
      continue;
    }

    // Resolution: assigned shift's hours → org's standard_workday_hours.
    let resolvedHours = orgConfig.hours;
    const rowShiftId = (row as any).shift_id as string | null;
    if (rowShiftId && shiftsById.has(rowShiftId)) {
      resolvedHours = shiftsById.get(rowShiftId)!.total_hours;
    }

    const clockInAt = new Date(row.clock_in_at);
    const proposedClockOut = new Date(clockInAt.getTime() + resolvedHours * 60 * 60 * 1000);
    const dayCap = endOfDateIST(row.date);
    const finalClockOut = proposedClockOut.getTime() < dayCap.getTime() ? proposedClockOut : dayCap;
    const totalMinutes = Math.max(0, Math.round((finalClockOut.getTime() - clockInAt.getTime()) / 60000));

    const { error: updateErr } = await supabase
      .from("attendance_records")
      .update({
        clock_out_at: finalClockOut.toISOString(),
        total_minutes: totalMinutes,
        auto_closed: true,
        source: "auto_close",
      })
      .eq("id", row.id)
      .is("clock_out_at", null); // re-check; idempotent if a manual close happened in the meantime

    if (updateErr) {
      console.error("attendance-auto-clockout: update failed", row.id, updateErr);
      failures.push({ id: row.id, error: updateErr.message });
      continue;
    }
    closedCount++;
    perOrg[row.org_id] = (perOrg[row.org_id] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    closedCount,
    skippedDisabled,
    failures,
    perOrg,
    today,
  });
}
