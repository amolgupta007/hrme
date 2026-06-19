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
    .select("id, to_employee_id, created_placeholder")
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  let count = 0;
  for (const t of (expired ?? []) as any[]) {
    await supabase.from("ownership_transfers").update({ status: "expired", responded_at: nowIso }).eq("id", t.id);
    // only delete the employee row if this transfer originally created it as a placeholder
    // and the invitee has never signed in — never delete pre-existing members
    if (t.created_placeholder) {
      const { data: inv } = await supabase
        .from("employees").select("id, clerk_user_id").eq("id", t.to_employee_id).single();
      if (inv && !(inv as any).clerk_user_id) {
        await supabase.from("employees").delete().eq("id", (inv as any).id);
      }
    }
    count++;
  }
  return NextResponse.json({ ok: true, expired: count });
}
