// src/lib/assistant/insights/engine.ts
import { hasFeature } from "@/config/plans";
import { TOP_INSIGHTS } from "./constants";
import type { Insight, InsightContext, InsightRule } from "./types";

export function isRuleApplicable(rule: InsightRule, ctx: InsightContext): boolean {
  if (rule.requiredFeature && !hasFeature(ctx.plan, rule.requiredFeature, ctx.customFeatures)) return false;
  if (rule.requiredFlag && !ctx.flags[rule.requiredFlag]) return false;
  return true;
}

export function selectTopInsights(insights: Insight[], n: number = TOP_INSIGHTS): Insight[] {
  return [...insights].sort((a, b) => b.priority - a.priority).slice(0, n);
}
