import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

// Daily sweep — flips loi_status='pending' to 'expired' when loi_expires_at has passed.
// No email is sent on expiry (admin can resend from the card UI).
// Schedule: 0 4 * * * UTC = 09:30 IST (matches the existing nudge crons).

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminSupabase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("applications")
    .update({ loi_status: "expired" } as any)
    .eq("loi_status", "pending")
    .lt("loi_expires_at", nowIso)
    .select("id");

  if (error) {
    console.error("loi-expiry cron failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const expiredCount = (data ?? []).length;
  return NextResponse.json({ ok: true, expiredCount, ranAt: nowIso });
}
