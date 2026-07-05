import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { verifyIndeedSignature } from "@/lib/indeed/signature";
import { IndeedApplicationSchema } from "@/lib/indeed/types";
import { ingestIndeedApplication } from "@/lib/indeed/ingest";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("x-indeed-signature");
  const secret = process.env.INDEED_APPLY_SHARED_SECRET || "";

  if (!verifyIndeedSignature(body, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = IndeedApplicationSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // idempotency via shared webhook_events table
  const supabase = createAdminSupabase();
  const { error: dedupeError } = await supabase
    .from("webhook_events")
    .insert({ id: `indeed_${payload.id}`, event_type: "indeed.application" });
  if (dedupeError?.code === "23505") {
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }

  try {
    const result = await ingestIndeedApplication(payload);
    // 200 for created/duplicate/unknown_job — none are retryable
    return NextResponse.json({ status: result }, { status: 200 });
  } catch (err) {
    console.error("[indeed] ingest failed", err);
    // Roll back the dedup claim so Indeed's retry (triggered by the 500) can reprocess.
    try {
      await supabase.from("webhook_events").delete().eq("id", `indeed_${payload.id}`);
    } catch (rollbackErr) {
      console.error("[indeed] failed to roll back webhook_events dedup row", rollbackErr);
    }
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
