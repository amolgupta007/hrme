import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { runAttendanceReminders } from "@/lib/attendance/reminders-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Clock-in / clock-out reminders. Called every 5 minutes by a Supabase pg_cron
 * job (Vercel Hobby crons only run once a day, imprecisely — not good enough
 * for "10:15"). Each org's reminders fire when its configured IST time comes
 * round; repeated calls are no-ops thanks to attendance_reminder_log.
 *
 * Auth: Bearer ATTENDANCE_REMINDERS_SECRET (the secret pg_cron holds, which
 * unlocks only this endpoint) or the shared CRON_SECRET for manual runs.
 */
function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const accepted = [process.env.ATTENDANCE_REMINDERS_SECRET, process.env.CRON_SECRET].filter(
    (s): s is string => !!s && s.length >= 16
  );
  return accepted.some((s) => header === `Bearer ${s}`);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const summary = await runAttendanceReminders(createAdminSupabase());
    if (summary.sent.length || summary.errors.length) console.log("[attendance-reminders]", JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[attendance-reminders] run failed:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}

// pg_net posts; GET kept for manual runs and Vercel-style cron calls.
export const POST = handle;
export const GET = handle;
