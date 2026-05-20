import { createAdminSupabase } from "@/lib/supabase/server";
import { ingestDocument } from "@/lib/assistant/ingest-document";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Safety-net reconcile: re-attempts company-wide docs that are unindexed, pending, or failed.
// The primary ingest path is the upload-time waitUntil call; this catches anything that slipped.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("is_company_wide", true)
    .or("index_status.is.null,index_status.eq.failed,index_status.eq.pending")
    .limit(25);

  let processed = 0;
  for (const doc of data ?? []) {
    try {
      await ingestDocument((doc as { id: string }).id);
      processed++;
    } catch (err) {
      console.error("[assistant-doc-reindex] failed:", err);
    }
  }

  return NextResponse.json({ ok: true, processed });
}
