import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

/**
 * Clerk SMS delivery webhook — BYO SMS provider (MSG91 + Airtel DLT).
 *
 * Clerk generates + verifies the OTP. We only deliver it. This fires ONLY for
 * SMS templates where "Delivered by Clerk" is toggled OFF (Dashboard →
 * Customization → SMS → Verification code). Clerk emits `sms.created`; we push
 * the code through MSG91's Flow API using our DLT-registered template.
 *
 * Setup in Clerk Dashboard → Webhooks: create a NEW endpoint pointing at
 *   https://jambahr.com/api/webhooks/clerk-sms
 * subscribed to `sms.created`, and copy its Signing Secret into
 * CLERK_SMS_WEBHOOK_SECRET (this is a DIFFERENT secret from the main
 * CLERK_WEBHOOK_SECRET used by /api/webhooks/clerk).
 *
 * Required env:
 *   CLERK_SMS_WEBHOOK_SECRET  - signing secret of the SMS webhook endpoint
 *   MSG91_AUTHKEY             - MSG91 account authkey
 *   MSG91_TEMPLATE_ID         - DLT-approved Flow/template id that holds the OTP
 *   MSG91_OTP_VAR_NAME        - variable name in that template (default "otp")
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_SMS_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "CLERK_SMS_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);
  let event: any;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("[clerk-sms] verification failed:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  if (event.type !== "sms.created") {
    console.warn(`[clerk-sms] ignoring event ${event.type}`);
    return NextResponse.json({ received: true });
  }

  const data = event.data ?? {};

  // First-run aid: log the raw payload once so you can confirm Clerk's exact
  // field names against this code, then trim this log.
  console.warn("[clerk-sms] sms.created payload:", JSON.stringify(data));

  // Clerk's SMS message object. Field names confirmed defensively:
  //  - to_phone_number: E.164 destination, e.g. "+919812345678"
  //  - otp_code: the verification code (present for verification templates)
  //  - message: the fully rendered SMS body (fallback to pull digits from)
  const toPhone: string | undefined =
    data.to_phone_number || data.phone_number || data.to;
  const otpCode: string | undefined =
    data.otp_code ?? data.data?.otp_code ?? extractCode(data.message);

  if (!toPhone || !otpCode) {
    console.error(
      `[clerk-sms] could not extract phone/code (phone=${toPhone}, code=${
        otpCode ? "present" : "missing"
      }) — check payload log above`
    );
    // 200 so Clerk doesn't retry a payload we can't parse; investigate via logs.
    return NextResponse.json({ received: true, delivered: false });
  }

  try {
    await sendViaMsg91(toPhone, otpCode);
  } catch (err) {
    console.error("[clerk-sms] MSG91 delivery failed:", err);
    // 500 → Clerk retries the webhook. Accept rare duplicate over a lost OTP.
    return NextResponse.json({ error: "delivery failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, delivered: true });
}

/** Pull the first 4–8 digit run out of a rendered SMS body as a fallback. */
function extractCode(message?: string): string | undefined {
  if (!message) return undefined;
  return message.match(/\b(\d{4,8})\b/)?.[1];
}

async function sendViaMsg91(e164Phone: string, otp: string): Promise<void> {
  const authkey = process.env.MSG91_AUTHKEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const varName = process.env.MSG91_OTP_VAR_NAME || "otp";

  if (!authkey || !templateId) {
    throw new Error("MSG91_AUTHKEY / MSG91_TEMPLATE_ID not configured");
  }

  // MSG91 wants the number WITHOUT a leading "+" (country code retained).
  const mobiles = e164Phone.replace(/^\+/, "").replace(/\D/g, "");

  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      authkey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles, [varName]: otp }],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MSG91 HTTP ${res.status}: ${text}`);
  }
  // MSG91 returns 200 with { type: "success" | "error", ... } — surface errors.
  try {
    const json = JSON.parse(text);
    if (json?.type && json.type !== "success") {
      throw new Error(`MSG91 error: ${text}`);
    }
  } catch {
    // non-JSON 200 — treat as delivered, MSG91 occasionally returns a bare id
  }
}
