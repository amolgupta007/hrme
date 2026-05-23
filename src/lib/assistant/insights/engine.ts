// src/lib/assistant/insights/engine.ts
import { hasFeature } from "@/config/plans";
import { TOP_INSIGHTS, istNow, istDateString } from "./constants";
import type { Insight, InsightContext, InsightRule, AdminSupabase } from "./types";
import type { OrgPlan } from "@/config/plans";
import { INSIGHT_RULES } from "./registry";

export function isRuleApplicable(rule: InsightRule, ctx: InsightContext): boolean {
  if (rule.requiredFeature && !hasFeature(ctx.plan, rule.requiredFeature, ctx.customFeatures)) return false;
  if (rule.requiredFlag && !ctx.flags[rule.requiredFlag]) return false;
  return true;
}

export function selectTopInsights(insights: Insight[], n: number = TOP_INSIGHTS): Insight[] {
  return [...insights].sort((a, b) => b.priority - a.priority).slice(0, n);
}

export async function buildContext(supabase: AdminSupabase, orgId: string, now: Date = new Date()): Promise<InsightContext> {
  const { data, error } = await supabase
    .from("organizations")
    .select("plan, settings, custom_features")
    .eq("id", orgId)
    .single();
  if (error) console.warn(`[insights] buildContext could not load org ${orgId}:`, error.message);
  const row = (data ?? {}) as { plan?: string; settings?: Record<string, unknown>; custom_features?: string[] | null };
  const settings = row.settings ?? {};
  return {
    orgId,
    plan: (row.plan as OrgPlan) ?? "starter",
    today: istNow(now),
    customFeatures: (row.custom_features as string[] | null) ?? null,
    flags: {
      jambaHireEnabled: !!settings["jambahire_enabled"],
      attendanceEnabled: !!settings["attendance_enabled"],
      grievancesEnabled: !!settings["grievances_enabled"],
    },
  };
}

export async function runInsightsForOrg(supabase: AdminSupabase, orgId: string, now: Date = new Date()): Promise<Insight[]> {
  const ctx = await buildContext(supabase, orgId, now);
  const out: Insight[] = [];
  for (const rule of INSIGHT_RULES) {
    if (!isRuleApplicable(rule, ctx)) continue;
    try {
      const data = await rule.fetch(supabase, ctx);
      const insight = rule.evaluate(data, ctx);
      if (insight) out.push(insight);
    } catch (err) {
      console.warn(`[insights] rule ${rule.key} failed for org ${orgId}:`, err);
    }
  }
  return out;
}

/** Replace today's non-dismissed rows for the org with a fresh set. Keeps dismissed rows. */
export async function persistInsights(supabase: AdminSupabase, orgId: string, insights: Insight[], now: Date = new Date()): Promise<void> {
  const computedFor = istDateString(istNow(now));
  await supabase
    .from("assistant_insights")
    .delete()
    .eq("org_id", orgId)
    .eq("computed_for", computedFor)
    .is("dismissed_at", null);
  if (insights.length === 0) return;
  const rows = insights.map((i) => ({
    org_id: orgId, rule_key: i.ruleKey, category: i.category, priority: i.priority,
    title: i.title, body: i.body, metric_count: i.metricCount, deep_link: i.deepLink,
    computed_for: computedFor,
  }));
  await supabase.from("assistant_insights").upsert(rows, { onConflict: "org_id,rule_key,computed_for" });
}
