import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminSupabase } from "@/lib/supabase/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  employeeUpdateFromClerk,
  missingEmployeeIdentifiers,
  type ClerkIdentifiers,
} from "@/lib/clerk/user-sync";
import { syncEmployeeAuthIdentifiers } from "@/lib/clerk/provision-phone-user";
import { normalizePhone } from "@/lib/phone";
import type { UserRole } from "@/types";

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
        // Only sync what Clerk actually has — never blank a JambaHR name.
        const update = employeeUpdateFromClerk({ first_name, last_name, image_url });
        if (Object.keys(update).length > 0) {
          await supabase.from("employees").update(update).eq("clerk_user_id", id);
        }
        await restoreEmployeeIdentifiers(supabase, id, event.data);
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

/**
 * Put back any work email/phone the person removed from their own login.
 * JambaHR owns these (admins set them on the employee row); without them
 * email or phone sign-in answers "Couldn't find your account". Best-effort:
 * a failure is logged, never fails the webhook. Re-adding fires another
 * user.updated, which then finds nothing missing — no loop.
 */
async function restoreEmployeeIdentifiers(
  supabase: ReturnType<typeof createAdminSupabase>,
  clerkUserId: string,
  data: ClerkIdentifiers
) {
  try {
    const { data: rows } = await supabase
      .from("employees")
      .select("email, phone, role")
      .eq("clerk_user_id", clerkUserId)
      .neq("status", "terminated");
    const employees = (rows ?? []) as { email: string | null; phone: string | null; role: UserRole }[];
    if (employees.length === 0) return;

    const missing = missingEmployeeIdentifiers(data, employees, normalizePhone);
    if (missing.length === 0) return;

    const client = await clerkClient();
    for (const m of missing) {
      try {
        await syncEmployeeAuthIdentifiers(client, {
          email: m.email,
          phoneE164: m.phone,
          role: employees[0].role,
          existingClerkUserId: clerkUserId,
        });
        console.warn(`Restored sign-in identifier(s) on ${clerkUserId}`);
      } catch (err: any) {
        console.warn(`Could not restore sign-in identifier on ${clerkUserId}:`, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.warn("restoreEmployeeIdentifiers failed (non-fatal):", err?.message ?? err);
  }
}
