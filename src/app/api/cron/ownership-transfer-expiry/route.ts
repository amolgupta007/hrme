import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createAdminSupabase();
  const nowIso = new Date().toISOString();

  const { data: expired } = await supabase
    .from("ownership_transfers")
    .select("id, to_employee_id")
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  let count = 0;
  for (const t of (expired ?? []) as any[]) {
    await supabase.from("ownership_transfers").update({ status: "expired", responded_at: nowIso }).eq("id", t.id);
    const { data: inv } = await supabase
      .from("employees").select("id, clerk_user_id, role").eq("id", t.to_employee_id).single();
    if (inv && !(inv as any).clerk_user_id && (inv as any).role === "admin") {
      await supabase.from("employees").delete().eq("id", (inv as any).id);
    }
    count++;
  }
  return NextResponse.json({ ok: true, expired: count });
}
