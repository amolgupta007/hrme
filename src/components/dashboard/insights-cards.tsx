// src/components/dashboard/insights-cards.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Lightbulb, RefreshCw, X, ChevronRight,
  CalendarClock, ShieldAlert, Users, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trackAssistant } from "@/lib/assistant/posthog-events";
import { refreshInsights, dismissInsight } from "@/actions/assistant-insights";
import type { Insight, InsightCategory } from "@/lib/assistant/insights/types";

const CATEGORY_META: Record<InsightCategory, { icon: typeof Lightbulb; tint: string }> = {
  leave: { icon: CalendarClock, tint: "text-sky-600 bg-sky-50" },
  compliance: { icon: ShieldAlert, tint: "text-amber-600 bg-amber-50" },
  people: { icon: Users, tint: "text-violet-600 bg-violet-50" },
  ops: { icon: Activity, tint: "text-rose-600 bg-rose-50" },
};

export function InsightsCards({ insights: initial }: { insights: Insight[] }) {
  const [insights, setInsights] = useState<Insight[]>(initial);
  const [pending, startTransition] = useTransition();
  const shownRef = useRef<Set<string>>(new Set());

  // Fire one impression event per insight the first time it is surfaced this mount.
  useEffect(() => {
    for (const i of insights) {
      if (shownRef.current.has(i.ruleKey)) continue;
      shownRef.current.add(i.ruleKey);
      trackAssistant({ name: "insight_shown", props: { rule_key: i.ruleKey } });
    }
  }, [insights]);

  if (insights.length === 0) return null; // hide entirely when nothing to surface

  const onRefresh = () =>
    startTransition(async () => {
      const res = await refreshInsights();
      if (res.success) {
        setInsights(res.data);
        trackAssistant({ name: "insights_refreshed", props: { count: res.data.length } });
      } else {
        toast.error(res.error);
      }
    });

  const onDismiss = (ruleKey: string) => {
    setInsights((cur) => cur.filter((i) => i.ruleKey !== ruleKey)); // optimistic
    trackAssistant({ name: "insight_dismissed", props: { rule_key: ruleKey } });
    startTransition(async () => {
      const res = await dismissInsight(ruleKey);
      if (!res.success) toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Lightbulb className="h-4 w-4 text-accent" /> Insights
        </h2>
        <button
          onClick={onRefresh}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((i) => {
          const meta = CATEGORY_META[i.category];
          const Icon = meta.icon;
          return (
            <div key={i.ruleKey} className="relative rounded-xl border border-border bg-card p-4">
              <button
                aria-label="Dismiss"
                onClick={() => onDismiss(i.ruleKey)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className={cn("inline-flex rounded-lg p-2", meta.tint)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{i.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{i.body}</p>
              <Link
                href={i.deepLink}
                onClick={() => trackAssistant({ name: "insight_clicked", props: { rule_key: i.ruleKey } })}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
