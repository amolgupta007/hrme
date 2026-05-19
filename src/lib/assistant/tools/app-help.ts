import { tool } from "ai";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { embed } from "@/lib/assistant/embeddings";
import { getHelpArticle } from "@/lib/assistant/help";
import { getRoute } from "@/lib/assistant/route-registry";
import type { UserRole } from "@/types";
import type { OrgPlan } from "@/config/plans";

const PLAN_ORDER: Record<OrgPlan, number> = {
  starter: 0,
  growth: 1,
  business: 2,
  custom: 3,
};

type OrgFeatures = {
  jambaHireEnabled: boolean;
  attendanceEnabled: boolean;
  grievancesEnabled: boolean;
};

type Ctx = { role: UserRole; plan: OrgPlan; orgFeatures: OrgFeatures };

function articleAccessible(
  article: { allowed_roles: UserRole[]; plan_tier: OrgPlan; route_key: string },
  ctx: Ctx,
): boolean {
  if (!article.allowed_roles.includes(ctx.role)) return false;
  if (PLAN_ORDER[ctx.plan] < PLAN_ORDER[article.plan_tier]) return false;
  const route = getRoute(article.route_key);
  if (route?.required_org_feature && !ctx.orgFeatures[route.required_org_feature]) return false;
  return true;
}

export function makeAppHelpTools(ctx: Ctx) {
  return {
    "app_help_search": tool({
      description:
        "Search JambaHR app-help articles for a how-to question. Returns ranked snippets the assistant can synthesise an answer from.",
      inputSchema: z.object({
        query: z.string().min(3).max(200),
        max_results: z.number().int().min(1).max(5).optional(),
      }),
      execute: async ({ query, max_results = 3 }) => {
        const [queryEmbedding] = await embed({ texts: [query], inputType: "query" });
        const supabase = createAdminSupabase();
        const { data, error } = await supabase.rpc("match_help_chunks", {
          query_embedding: queryEmbedding as unknown as string,
          match_count: max_results * 3, // over-fetch then filter by access
        });
        if (error) throw error;

        const seen = new Set<string>();
        const results: Array<{
          id: string;
          title: string;
          summary: string;
          route_key: string;
          snippet: string;
          score: number;
        }> = [];
        for (const row of (data ?? []) as Array<{
          article_id: string;
          content: string;
          similarity: number;
        }>) {
          const article = getHelpArticle(row.article_id);
          if (!article || !articleAccessible(article, ctx)) continue;
          if (seen.has(article.id)) continue;
          seen.add(article.id);
          results.push({
            id: article.id,
            title: article.title,
            summary: article.summary,
            route_key: article.route_key,
            snippet: row.content.slice(0, 280),
            score: row.similarity,
          });
          if (results.length >= max_results) break;
        }
        return results;
      },
    }),

    "app_help_get_steps": tool({
      description: "Fetch the full step list for a help article by id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const article = getHelpArticle(id);
        if (!article || !articleAccessible(article, ctx)) return null;
        return {
          id: article.id,
          title: article.title,
          steps: article.steps,
          route_key: article.route_key,
        };
      },
    }),

    "app_help_get_route": tool({
      description: "Resolve a feature key to its in-app destination. Returns null for unknown keys.",
      inputSchema: z.object({ feature_key: z.string() }),
      execute: async ({ feature_key }) => {
        const entry = getRoute(feature_key);
        if (!entry) return null;
        if (PLAN_ORDER[ctx.plan] < PLAN_ORDER[entry.required_plan]) return null;
        if (entry.required_org_feature && !ctx.orgFeatures[entry.required_org_feature]) return null;
        return entry;
      },
    }),
  };
}
