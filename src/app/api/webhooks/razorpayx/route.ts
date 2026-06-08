import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminSupabase } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto/aes-gcm";
import { reconcileBatchAndRunStatus } from "@/lib/payroll/disbursement-reconcile";

/**
 * RazorpayX webhook endpoint.
 *
 * Verification flow:
 *   1. Read body + signature header.
 *   2. Parse body; extract `account_id` from the event payload (RazorpayX merchant identifier).
 *   3. Look up razorpayx_credentials by account_id → get encrypted webhook_secret.
 *   4. Decrypt webhook_secret + HMAC-SHA256 verify the body.
 *   5. Idempotency check via webhook_events table.
 *   6. Dispatch on event.event:
 *        payout.queued / payout.initiated / payout.processing → status update
 *        payout.processed → status='paid', paid_at, fee_paise
 *        payout.rejected / payout.failed / payout.reversed → status='failed', failure_reason
 *   7. After updating items, reconcile batch + payroll_runs status.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // RazorpayX webhook payloads include account_id at the top level for X (banking) events.
  const accountId =
    event.account_id ??
    event.payload?.account_id ??
    event.payload?.payout?.entity?.notes?.account_id ??
    null;

  if (!accountId) {
    console.error("razorpayx webhook: no account_id in payload");
    return NextResponse.json({ error: "No account_id" }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const { data: creds } = await supabase
    .from("razorpayx_credentials")
    .select("org_id, webhook_secret_encrypted")
    .eq("account_id", accountId)
    .maybeSingle();

  if (!creds) {
    console.error("razorpayx webhook: no org found for account_id", accountId);
    return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = decrypt((creds as any).webhook_secret_encrypted);
  } catch (e: any) {
    console.error("razorpayx webhook: secret decryption failed", e?.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // HMAC verify
  const expected = createHmac("sha256", webhookSecret).update(body).digest("hex");
  const provided = signature;
  // Use timingSafeEqual to avoid timing attacks
  let valid = false;
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(provided, "hex");
    valid = expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    valid = false;
  }
  if (!valid) {
    console.error("razorpayx webhook: signature verification failed");
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // Idempotency: dedupe via webhook_events
  const eventId = event.id as string | undefined;
  if (eventId) {
    const { error: dedupeError } = await supabase
      .from("webhook_events")
      .insert({ id: eventId, event_type: event.event });
    if (dedupeError && dedupeError.code === "23505") {
      return NextResponse.json({ received: true, deduped: true });
    }
  }

  const orgId = (creds as any).org_id;

  try {
    switch (event.event) {
      case "payout.queued":
      case "payout.initiated":
      case "payout.processing":
      case "payout.processed":
      case "payout.rejected":
      case "payout.failed":
      case "payout.reversed":
      case "payout.cancelled": {
        const payout = event.payload?.payout?.entity ?? event.payload?.entity;
        if (!payout) {
          console.error("razorpayx webhook: no payout entity in payload for", event.event);
          break;
        }

        // Find the disbursement_item via reference_id (which we set to the item.id) OR via razorpayx_payout_id
        let item: any | null = null;
        if (payout.reference_id) {
          const { data } = await supabase
            .from("disbursement_items")
            .select("*")
            .eq("id", payout.reference_id)
            .eq("org_id", orgId)
            .maybeSingle();
          item = data;
        }
        if (!item && payout.id) {
          const { data } = await supabase
            .from("disbursement_items")
            .select("*")
            .eq("razorpayx_payout_id", payout.id)
            .eq("org_id", orgId)
            .maybeSingle();
          item = data;
        }
        if (!item) {
          console.warn("razorpayx webhook: no matching item for payout", payout.id);
          break;
        }

        // Map RazorpayX payout entity status → our disbursement_items.status
        const apiStatus = payout.status as string;
        let mapped: string;
        switch (apiStatus) {
          case "queued":
          case "pending":
            mapped = "queued";
            break;
          case "processing":
          case "initiated":
            mapped = "processing";
            break;
          case "processed":
            mapped = "paid";
            break;
          case "rejected":
          case "cancelled":
          case "failed":
            mapped = "failed";
            break;
          case "reversed":
            mapped = "reversed";
            break;
          default:
            mapped = "processing";
        }

        await supabase
          .from("disbursement_items")
          .update({
            status: mapped,
            razorpayx_payout_id: payout.id,
            failure_reason: payout.failure_reason ?? null,
            fee_paise: payout.fees ?? item.fee_paise ?? 0,
            paid_at: mapped === "paid" ? new Date().toISOString() : null,
          } as any)
          .eq("id", item.id);

        // Audit log
        await supabase.from("disbursement_audit_log").insert({
          org_id: orgId,
          batch_id: item.batch_id,
          item_id: item.id,
          actor_id: null,
          actor_role: null,
          action: "webhook_status_change",
          payload: { event: event.event, from: item.status, to: mapped, razorpayx_payout_id: payout.id },
        } as any);

        // Reconcile batch + run status via shared helper (P26)
        await reconcileBatchAndRunStatus(supabase, item.batch_id, orgId);
        break;
      }

      default:
        console.warn(`Unhandled RazorpayX event: ${event.event}`);
    }
  } catch (error: any) {
    console.error(`Error processing RazorpayX webhook ${event.event}:`, error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
