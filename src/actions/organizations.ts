"use server";

import { auth } from "@clerk/nextjs/server";
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

  const { error } = await supabase.from("organizations").upsert(
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
  );

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
