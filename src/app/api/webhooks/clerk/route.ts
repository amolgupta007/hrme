import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Clerk Webhook Handler
 *
 * Listens for Clerk events and syncs relevant data to Supabase.
 * Configure this endpoint in Clerk Dashboard → Webhooks:
 *   URL: https://yourdomain.com/api/webhooks/clerk
 *   Events: organization.created, organization.updated, user.created, user.updated
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
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabase();
  const eventType = event.type;

  try {
    switch (eventType) {
      case "organization.created": {
        const { id, name, slug } = event.data;
        await supabase.from("organizations").insert({
          clerk_org_id: id,
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
          plan: "starter",
          max_employees: 10,
          settings: {},
        });
        break;
      }

      case "organization.updated": {
        const { id, name, slug } = event.data;
        await supabase
          .from("organizations")
          .update({ name, slug })
          .eq("clerk_org_id", id);
        break;
      }

      case "user.created": {
        // User creation is handled during onboarding flow
        // This webhook is a fallback to ensure data consistency
        const { id, email_addresses, first_name, last_name, image_url } =
          event.data;
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
