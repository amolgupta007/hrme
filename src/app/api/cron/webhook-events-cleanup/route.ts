import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from("webhook_events")
    .delete({ count: "exact" })
    .lt("processed_at", cutoff);

  if (error) {
    console.error("webhook-events-cleanup failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
