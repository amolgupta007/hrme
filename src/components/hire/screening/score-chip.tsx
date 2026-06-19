import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/screening/types";

const TIER_STYLES: Record<Tier, string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-200",
  possible: "bg-amber-100 text-amber-800 border-amber-200",
  weak: "bg-rose-100 text-rose-800 border-rose-200",
};

export function ScoreChip({ score, tier }: { score: number | null; tier: Tier | null }) {
  if (score === null || tier === null)
    return <span className="text-xs text-muted-foreground">Not screened</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TIER_STYLES[tier],
      )}
    >
      {score} · {tier}
    </span>
  );
}
