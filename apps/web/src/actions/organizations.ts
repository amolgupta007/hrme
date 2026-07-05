"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { resend, FOUNDER_EMAIL_FROM } from "@/lib/resend";
import { FounderAlertEmail } from "@/components/emails/founder-alert";
import { WelcomeEmail } from "@/components/emails/welcome";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import { DEFAULT_ONBOARDING_STEPS } from "@/config/onboarding";
import { DEFAULT_LEAVE_POLICIES, DEFAULT_HOLIDAYS_2026 } from "@/config/onboarding-seed";
import type { ActionResult } from "@/types";

const FOUNDER_EMAIL = "amol@jambahr.com";

/**
 * Create a brand-new organization owned by the caller.
 *
 * This is the Option-0 replacement for the Clerk `organization.created` flow:
 * multi-tenancy lives entirely in our `organizations` + `employees` tables, so
 * there is no Clerk org and no membership quota. Consolidates everything the
 * deleted webhook used to do: create the org row, seed the owner employee from
 * the Clerk user's identity, seed default leave policies + holidays +
 * onboarding steps, record legal acceptance, and set the active-org cookie so
 * the caller lands in the new org on the next request.
 *
 * Used by both onboarding (signed-in user with zero memberships) and the
 * "Create organization" switcher action (existing user spinning up another org).
 */
export async function createOrganization(data: {
  name: string;
  privacyAcceptedAt: string;
  termsAcceptedAt: string;
  policyVersionAccepted: string;
}): Promise<ActionResult<{ orgId: string }>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  if (!data.name?.trim()) return { success: false, error: "Company name is required" };

  const supabase = createAdminSupabase();

  // 1. Create the org (no clerk_org_id — multi-tenancy is our own now)
  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name: data.name.trim(),
      slug: slugify(data.name) + "-" + Math.random().toString(36).slice(2, 8),
      plan: "starter",
      max_employees: 10,
      settings: { onboarding_steps: DEFAULT_ONBOARDING_STEPS },
      privacy_policy_accepted_at: data.privacyAcceptedAt,
      terms_accepted_at: data.termsAcceptedAt,
      policy_version_accepted: data.policyVersionAccepted,
    })
    .select("id")
    .single();
  if (error || !org) {
    return { success: false, error: error?.message ?? "Failed to create organization" };
  }
  const orgId = (org as { id: string }).id;

  // 2. Owner employee row from Clerk user identity
  let ownerEmail: string | null = null;
  let ownerFirstName = "there";
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    ownerEmail =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      null;
    ownerFirstName = user.firstName ?? "there";
    const phone =
      user.primaryPhoneNumber?.phoneNumber ??
      user.phoneNumbers?.[0]?.phoneNumber ??
      null;
    await supabase.from("employees").insert({
      org_id: orgId,
      clerk_user_id: userId,
      first_name: user.firstName ?? "",
      last_name: user.lastName ?? "",
      email: ownerEmail,
      phone,
      avatar_url: user.imageUrl ?? null,
      role: "owner",
      status: "active",
    });
  } catch (err) {
    console.error("Failed to seed owner employee row:", err);
    // Non-fatal: getCurrentUser's admin fallback keeps the org usable.
  }

  // 3. Seed default leave policies + holidays (moved from the deleted org.created webhook)
  await supabase
    .from("leave_policies")
    .insert(DEFAULT_LEAVE_POLICIES.map((p) => ({ ...p, org_id: orgId })));
  await supabase
    .from("holidays")
    .insert(DEFAULT_HOLIDAYS_2026.map((h) => ({ ...h, org_id: orgId })));

  // 3b. New-signup notifications (best-effort, non-fatal) — moved from the
  // deleted Clerk organization.created webhook so signups still alert the
  // founder and welcome the new owner.
  try {
    resend.emails
      .send({
        from: FOUNDER_EMAIL_FROM,
        to: FOUNDER_EMAIL,
        subject: `🎉 New signup: ${data.name.trim()}`,
        html: await render(
          FounderAlertEmail({
            orgName: data.name.trim(),
            industry: "Unknown",
            companySize: "Unknown",
            ownerEmail: ownerEmail ?? "unknown",
            signupTime: new Date().toISOString(),
          })
        ),
      })
      .catch((e: unknown) => console.error("Founder alert email failed:", e));

    if (ownerEmail) {
      resend.emails
        .send({
          from: FOUNDER_EMAIL_FROM,
          to: ownerEmail,
          subject: "Welcome to JambaHR — your workspace is ready",
          html: await render(
            WelcomeEmail({
              orgName: data.name.trim(),
              ownerFirstName,
              dashboardUrl: "https://jambahr.com/dashboard",
            })
          ),
        })
        .catch((e: unknown) => console.error("Welcome email failed:", e));
    }
  } catch (err) {
    console.error("Signup notification emails failed (non-fatal):", err);
  }

  // 4. Make the new org active
  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { success: true, data: { orgId } };
}
