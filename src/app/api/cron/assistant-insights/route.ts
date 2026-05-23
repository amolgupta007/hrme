import { createAdminSupabase } from "@/lib/supabase/server";
import { runInsightsForOrg, persistInsights } from "@/lib/assistant/insights/engine";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, plan, settings")
    .in("plan", ["growth", "business", "custom"]);

  const now = new Date();
  let swept = 0;
  for (const o of (orgs ?? []) as Array<{ id: string; settings?: Record<string, unknown> }>) {
    if (!o.settings?.["assistant_enabled"]) continue;
    try {
      const insights = await runInsightsForOrg(supabase, o.id, now);
      await persistInsights(supabase, o.id, insights, now);
      swept++;
    } catch (err) {
      console.warn(`[assistant-insights] org ${o.id} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, swept });
}
