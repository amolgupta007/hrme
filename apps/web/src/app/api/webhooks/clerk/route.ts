import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Clerk Webhook Handler
 *
 * With Clerk Organizations decoupled, we only listen for USER events — to keep
 * the employees directory's name/avatar in sync with Clerk. Organization +
 * membership events are gone: multi-tenancy lives entirely in our
 * `organizations` + `employees` tables. Org creation happens in the
 * `createOrganization` server action; invited users auto-link on first sign-in
 * via getCurrentUser. Configure in Clerk Dashboard → Webhooks:
 *   Events: user.created, user.updated
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // Verify the webhook signature
  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let event: any;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const eventType = event.type;

  try {
    switch (eventType) {
      case "user.created": {
        // Org creation + employee linking are handled in-app (createOrganization
        // action + getCurrentUser auto-link). This is a no-op log for visibility.
        const { first_name, last_name, email_addresses } = event.data;
        const primaryEmail = email_addresses?.[0]?.email_address;
        console.warn(
          `User created via webhook: ${first_name} ${last_name} (${primaryEmail})`
        );
        break;
      }

      case "user.updated": {
        const { id, first_name, last_name, image_url } = event.data;
        await supabase
          .from("employees")
          .update({
            first_name: first_name || "",
            last_name: last_name || "",
            avatar_url: image_url,
          })
          .eq("clerk_user_id", id);
        break;
      }

      default:
        console.warn(`Unhandled webhook event: ${eventType}`);
    }
  } catch (error) {
    console.error(`Error processing webhook ${eventType}:`, error);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
