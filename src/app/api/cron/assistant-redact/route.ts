import { createAdminSupabase } from "@/lib/supabase/server";
import { redactPII } from "@/lib/assistant/redact";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = Date.now();
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

  // 1) Redact: messages older than 14d, not yet redacted, with content.
  let redacted = 0;
  const { data: toRedact } = await supabase
    .from("assistant_messages")
    .select("id, content")
    .lt("created_at", fourteenDaysAgo)
    .eq("pii_redacted", false)
    .not("content", "is", null)
    .limit(500);

  for (const m of (toRedact ?? []) as Array<{ id: string; content: string | null }>) {
    const red = redactPII(m.content ?? "");
    const { error } = await supabase
      .from("assistant_messages")
      .update({ content: red, pii_redacted: true, redacted_at: new Date().toISOString() })
      .eq("id", m.id);
    if (!error) redacted++;
  }

  // 2) Delete: conversations not updated in 90d (messages cascade).
  let deleted = 0;
  const { data: toDelete } = await supabase
    .from("assistant_conversations")
    .select("id")
    .lt("updated_at", ninetyDaysAgo)
    .limit(500);
  const ids = (toDelete ?? []).map((c) => (c as { id: string }).id);
  if (ids.length > 0) {
    const { error } = await supabase.from("assistant_conversations").delete().in("id", ids);
    if (!error) deleted = ids.length;
  }

  return NextResponse.json({ ok: true, redacted, deleted });
}
