import { createAdminSupabase } from "@/lib/supabase/server";

export const HOURLY_LIMIT = 30;

export type RateLimitVerdict =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "hourly-limit" };

export async function checkRateLimit(userEmployeeId: string): Promise<RateLimitVerdict> {
  const supabase = createAdminSupabase();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Count user-role messages in the last hour for conversations owned by this employee.
  const { count, error } = await supabase
    .from("assistant_messages")
    .select("id, assistant_conversations!inner(user_employee_id)", {
      count: "exact",
      head: true,
    })
    .eq("role", "user")
    .gte("created_at", since)
    .eq("assistant_conversations.user_employee_id", userEmployeeId);

  if (error) throw error;
  const used = count ?? 0;
  if (used >= HOURLY_LIMIT) return { allowed: false, reason: "hourly-limit" };
  return { allowed: true, remaining: HOURLY_LIMIT - used };
}
