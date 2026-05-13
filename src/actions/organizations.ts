"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
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
