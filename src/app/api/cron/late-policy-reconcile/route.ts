import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

function istMonth(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = createAdminSupabase();
  const month = istMonth();
  const monthStart = `${month}-01`;

  const { data: policies } = await sb.from("late_policies").select("*").eq("enabled", true);
  let flagged = 0;
  for (const p of (policies ?? []) as any[]) {
    const { data: lateRows } = await sb
      .from("attendance_records")
      .select("employee_id")
      .eq("org_id", p.org_id).eq("is_late", true)
      .gte("date", monthStart);
    const counts = new Map<string, number>();
    for (const r of (lateRows ?? []) as any[]) counts.set(r.employee_id, (counts.get(r.employee_id) ?? 0) + 1);
    for (const [employeeId, count] of counts) {
      if (count < p.threshold_days) continue;
      const { data: existing } = await sb
        .from("late_policy_flags").select("id, status")
        .eq("org_id", p.org_id).eq("employee_id", employeeId).eq("month", month).maybeSingle();
      if (existing) {
        if ((existing as any).status !== "overridden") {
          await sb.from("late_policy_flags").update({ late_days_count: count, updated_at: new Date().toISOString() } as any).eq("id", (existing as any).id);
        }
      } else {
        await sb.from("late_policy_flags").insert({ org_id: p.org_id, policy_id: p.id, employee_id: employeeId, month, late_days_count: count, status: "flagged" } as any);
        flagged++;
      }
    }
  }
  return NextResponse.json({ ok: true, month, newlyFlagged: flagged });
}
