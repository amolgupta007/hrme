import type { ActionResult } from "@/types";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { SocialTheme } from "./types";

export async function pickNextTheme(): Promise<ActionResult<SocialTheme>> {
  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("social_themes")
    .select("*")
    .eq("is_active", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "No active themes available" };

  return { success: true, data: data as SocialTheme };
}

export async function getRecentCaptionsForTheme(
  themeId: string,
  limit = 3,
): Promise<ActionResult<string[]>> {
  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("social_posts")
    .select("caption")
    .eq("theme_id", themeId)
    .in("status", ["pending_approval", "approved", "scheduled", "published"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((row: { caption: string }) => row.caption),
  };
}

export async function markThemeUsed(themeId: string): Promise<ActionResult<void>> {
  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("social_themes")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", themeId);

  if (error) return { success: false, error: error.message };

  return { success: true, data: undefined };
}
