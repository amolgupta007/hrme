import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL, FOUNDER_EMAIL_FROM } from "@/lib/resend";
import { render } from "@react-email/render";
import { FounderAlertEmail } from "@/components/emails/founder-alert";
import { WelcomeEmail } from "@/components/emails/welcome";
import { DEFAULT_ONBOARDING_STEPS } from "@/config/onboarding";

const FOUNDER_EMAIL = "amol@jambahr.com";

const DEFAULT_LEAVE_POLICIES = [
  { name: "Casual Leave", type: "casual", days_per_year: 8, carry_forward: false, max_carry_forward_days: 0, applicable_from_months: 0, requires_approval: true },
  { name: "Sick Leave", type: "sick", days_per_year: 8, carry_forward: true, max_carry_forward_days: 4, applicable_from_months: 0, requires_approval: false },
  { name: "Earned Leave", type: "paid", days_per_year: 18, carry_forward: true, max_carry_forward_days: 30, applicable_from_months: 6, requires_approval: true },
  { name: "Leave Without Pay", type: "unpaid", days_per_year: 0, carry_forward: false, max_carry_forward_days: 0, applicable_from_months: 0, requires_approval: true },
];

const DEFAULT_HOLIDAYS_2026 = [
  { name: "New Year's Day", date: "2026-01-01", is_optional: false },
  { name: "Republic Day", date: "2026-01-26", is_optional: false },
  { name: "Holi", date: "2026-03-03", is_optional: false },
  { name: "Good Friday", date: "2026-04-03", is_optional: true },
  { name: "Eid ul-Fitr", date: "2026-03-31", is_optional: true },
  { name: "Ambedkar Jayanti", date: "2026-04-14", is_optional: false },
  { name: "Eid ul-Adha", date: "2026-06-07", is_optional: true },
  { name: "Independence Day", date: "2026-08-15", is_optional: false },
  { name: "Janmashtami", date: "2026-08-20", is_optional: true },
  { name: "Gandhi Jayanti", date: "2026-10-02", is_optional: false },
  { name: "Dussehra", date: "2026-10-11", is_optional: false },
  { name: "Diwali", date: "2026-10-29", is_optional: false },
  { name: "Christmas", date: "2026-12-25", is_optional: false },
];

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
        const { id, name, slug, created_by } = event.data;

        // 1. Create org row
        const { data: newOrg } = await supabase
          .from("organizations")
          .insert({
            clerk_org_id: id,
            name,
            slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
            plan: "starter",
            max_employees: 10,
            settings: { onboarding_steps: DEFAULT_ONBOARDING_STEPS },
          })
          .select("id")
          .single();

        if (newOrg) {
          const orgId = (newOrg as { id: string }).id;

          // 2. Seed default leave policies
          await supabase.from("leave_policies").insert(
            DEFAULT_LEAVE_POLICIES.map((p) => ({ ...p, org_id: orgId }))
          );

          // 3. Seed holidays for current year
          const currentYear = new Date().getFullYear();
          const holidays =
            currentYear === 2026 ? DEFAULT_HOLIDAYS_2026 : DEFAULT_HOLIDAYS_2026;
          await supabase.from("holidays").insert(
            holidays.map((h) => ({ ...h, org_id: orgId }))
          );
        }

        // 4. Look up owner email from Clerk user data
        let ownerEmail = "";
        let ownerFirstName = "there";
        if (created_by) {
          const { data: userData } = await supabase
            .from("employees")
            .select("email, first_name")
            .eq("clerk_user_id", created_by)
            .single();
          if (userData) {
            ownerEmail = (userData as any).email ?? "";
            ownerFirstName = (userData as any).first_name ?? "there";
          }
        }

        // 5. Send founder alert (non-blocking)
        resend.emails.send({
          from: FOUNDER_EMAIL_FROM,
          to: FOUNDER_EMAIL,
          subject: `🎉 New signup: ${name}`,
          html: await render(
            FounderAlertEmail({
              orgName: name,
              industry: (event.data as any).public_metadata?.industry ?? "Unknown",
              companySize: (event.data as any).public_metadata?.companySize ?? "Unknown",
              ownerEmail: ownerEmail || "unknown",
              signupTime: new Date().toISOString(),
            })
          ),
        }).catch((err: unknown) => console.error("Founder alert email failed:", err));

        // 6. Send welcome email to new client (non-blocking)
        if (ownerEmail) {
          resend.emails.send({
            from: FOUNDER_EMAIL_FROM,
            to: ownerEmail,
            subject: `Welcome to JambaHR — your workspace is ready`,
            html: await render(
              WelcomeEmail({
                orgName: name,
                ownerFirstName,
                dashboardUrl: "https://jambahr.com/dashboard",
              })
            ),
          }).catch((err: unknown) => console.error("Welcome email failed:", err));
        }

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

      case "organizationMembership.created": {
        // Fires when a user accepts an org invitation.
        // Link their Clerk user ID to the existing Supabase employee record (matched by email).
        const membershipData = event.data;
        const clerkUserId: string = membershipData.public_user_data?.user_id;
        const clerkOrgId: string = membershipData.organization?.id;
        const memberEmail: string =
          membershipData.public_user_data?.identifier ?? // Clerk v5+ field
          membershipData.public_user_data?.email_address ?? // fallback
          "";

        if (!clerkUserId || !clerkOrgId || !memberEmail) break;

        // Look up the org in Supabase
        const { data: org } = await supabase
          .from("organizations")
          .select("id")
          .eq("clerk_org_id", clerkOrgId)
          .single();

        if (!org) break;

        // Find matching employee by email and write their clerk_user_id
        await supabase
          .from("employees")
          .update({ clerk_user_id: clerkUserId })
          .eq("org_id", (org as { id: string }).id)
          .eq("email", memberEmail)
          .is("clerk_user_id", null); // only set if not already linked

        // Stamp accepted_at on the employee_invites record
        await supabase
          .from("employee_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("org_id", (org as { id: string }).id)
          .eq("email", memberEmail)
          .is("accepted_at", null);

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
