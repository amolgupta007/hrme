"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import { DEFAULT_ONBOARDING_STEPS } from "@/config/onboarding";
import { DEFAULT_LEAVE_POLICIES, DEFAULT_HOLIDAYS_2026 } from "@/config/onboarding-seed";
import type { ActionResult } from "@/types";

export async function syncOrgToSupabase(data: {
  clerkOrgId: string;
  name: string;
  privacyAcceptedAt: string;
  termsAcceptedAt: string;
  policyVersionAccepted: string;
}): Promise<ActionResult<void>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: org, error } = await supabase
    .from("organizations")
    .upsert(
      {
        clerk_org_id: data.clerkOrgId,
        name: data.name,
        slug: slugify(data.name),
        plan: "starter",
        max_employees: 10,
        settings: {},
        privacy_policy_accepted_at: data.privacyAcceptedAt,
        terms_accepted_at: data.termsAcceptedAt,
        policy_version_accepted: data.policyVersionAccepted,
      },
      { onConflict: "clerk_org_id" }
    )
    .select("id")
    .single();

  if (error || !org) {
    return { success: false, error: error?.message ?? "Failed to create organization" };
  }

  const orgId = (org as { id: string }).id;

  // Ensure the owner has an employees row so they show up in the directory,
  // get a leave balance, and can participate in reviews/objectives/etc.
  // Without this, they exist only as a Clerk user and silently default to
  // role "admin" via getCurrentUser's fallback.
  const { data: existing } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!existing) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses?.[0]?.emailAddress ??
        "";
      const firstName = user.firstName ?? "";
      const lastName = user.lastName ?? "";
      const avatarUrl = user.imageUrl ?? null;

      if (email) {
        await supabase.from("employees").insert({
          org_id: orgId,
          clerk_user_id: userId,
          first_name: firstName,
          last_name: lastName,
          email,
          avatar_url: avatarUrl,
          role: "owner",
        });
      }
    } catch (err) {
      console.error("Failed to seed owner employee row:", err);
      // Non-fatal: org is still usable via getCurrentUser admin fallback,
      // and the owner can be added manually if this ever errors.
    }
  }

  return { success: true, data: undefined };
}

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
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      null;
    const phone =
      user.primaryPhoneNumber?.phoneNumber ??
      user.phoneNumbers?.[0]?.phoneNumber ??
      null;
    await supabase.from("employees").insert({
      org_id: orgId,
      clerk_user_id: userId,
      first_name: user.firstName ?? "",
      last_name: user.lastName ?? "",
      email,
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
