"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/types";

export async function syncOrgToSupabase(data: {
  clerkOrgId: string;
  name: string;
}): Promise<ActionResult<void>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Upsert so re-running onboarding doesn't break anything
  const { error } = await supabase.from("organizations").upsert(
    {
      clerk_org_id: data.clerkOrgId,
      name: data.name,
      slug: slugify(data.name),
      plan: "starter",
      max_employees: 10,
      settings: {},
    },
    { onConflict: "clerk_org_id" }
  );

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
