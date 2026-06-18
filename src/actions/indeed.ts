"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { pushJobToIndeed } from "@/lib/indeed/sync";
import type { ActionResult } from "@/types";

export async function toggleIndeedPosting(
  jobId: string,
  enabled: boolean
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("jobs")
    .update({
      indeed_enabled: enabled,
      indeed_status: enabled ? "pending" : null,
      ...(enabled ? {} : { indeed_sync_error: null }),
    })
    .eq("id", jobId)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  waitUntil(pushJobToIndeed(jobId));
  revalidatePath("/hire/jobs");
  return { success: true, data: undefined };
}
