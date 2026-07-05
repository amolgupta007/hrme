import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { pushJobToIndeed } from "@/lib/indeed/sync";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  // Re-push jobs that errored, never finished, or are enabled with no Indeed id yet.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("indeed_enabled", true)
    .or("indeed_status.eq.error,indeed_status.eq.pending,indeed_job_id.is.null");

  let processed = 0;
  for (const j of jobs ?? []) {
    await pushJobToIndeed((j as any).id);
    processed++;
  }
  return NextResponse.json({ ok: true, processed });
}
