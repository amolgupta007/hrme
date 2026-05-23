"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { istNow, istDateString } from "@/lib/assistant/insights/constants";
import { runInsightsForOrg, persistInsights, selectTopInsights } from "@/lib/assistant/insights/engine";
import type { Insight } from "@/lib/assistant/insights/types";
import type { ActionResult } from "@/types";

function mapRow(r: Record<string, unknown>): Insight {
  return {
    ruleKey: String(r.rule_key), category: r.category as Insight["category"],
    priority: Number(r.priority), title: String(r.title), body: String(r.body),
    metricCount: r.metric_count == null ? null : Number(r.metric_count),
    deepLink: String(r.deep_link),
  };
}

async function readTop(supabase: ReturnType<typeof createAdminSupabase>, orgId: string): Promise<Insight[]> {
  const computedFor = istDateString(istNow());
  const { data } = await supabase
    .from("assistant_insights")
    .select("rule_key, category, priority, title, body, metric_count, deep_link")
    .eq("org_id", orgId)
    .eq("computed_for", computedFor)
    .is("dismissed_at", null)
    .order("priority", { ascending: false })
    .limit(3);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
}

export async function getInsights(): Promise<ActionResult<Insight[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  if (!user.assistantEnabled || (user.plan !== "growth" && user.plan !== "business" && user.plan !== "custom")) {
    return { success: true, data: [] };
  }
  const supabase = createAdminSupabase();
  const computedFor = istDateString(istNow());

  // Same-day fallback: if NO rows exist for today (cron hasn't run), compute inline.
  const { count } = await supabase
    .from("assistant_insights")
    .select("id", { count: "exact", head: true })
    .eq("org_id", user.orgId)
    .eq("computed_for", computedFor);
  if ((count ?? 0) === 0) {
    const now = new Date();
    const fresh = await runInsightsForOrg(supabase, user.orgId, now);
    await persistInsights(supabase, user.orgId, fresh, now);
  }
  return { success: true, data: await readTop(supabase, user.orgId) };
}

export async function refreshInsights(): Promise<ActionResult<Insight[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const supabase = createAdminSupabase();
  const now = new Date();
  const fresh = await runInsightsForOrg(supabase, user.orgId, now);
  await persistInsights(supabase, user.orgId, fresh, now);
  revalidatePath("/dashboard");
  return { success: true, data: selectTopInsights(fresh) };
}

export async function dismissInsight(ruleKey: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const supabase = createAdminSupabase();
  const computedFor = istDateString(istNow());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("assistant_insights")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: user.employeeId })
    .eq("org_id", user.orgId)
    .eq("computed_for", computedFor)
    .eq("rule_key", ruleKey);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
