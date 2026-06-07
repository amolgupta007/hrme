"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";

const Schema = z.object({
  week_type: z.union([z.literal(5), z.literal(6)]),
  off_days: z.array(z.number().int().min(0).max(6)).min(1).max(2),
});

export async function getWeekOffPolicy(): Promise<ActionResult<WeekOffPolicy | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("week_off_policy")
    .select("week_type, off_days")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ? ((data as any) as WeekOffPolicy) : null };
}

export async function upsertWeekOffPolicy(input: unknown): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update week-off policy" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Sanity: 5-day week → at least 2 off days; 6-day → exactly 1 off day.
  if (parsed.data.week_type === 5 && parsed.data.off_days.length !== 2) {
    return { success: false, error: "5-day week must pick exactly 2 off days" };
  }
  if (parsed.data.week_type === 6 && parsed.data.off_days.length !== 1) {
    return { success: false, error: "6-day week must pick exactly 1 off day" };
  }

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("week_off_policy")
    .upsert({
      org_id: user.orgId,
      week_type: parsed.data.week_type,
      off_days: parsed.data.off_days,
    } as any, { onConflict: "org_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
