import { cn } from "@/lib/utils";
import type { CoverageItem } from "@/lib/screening/types";

const DOT: Record<CoverageItem["status"], string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

const LEGEND: { status: CoverageItem["status"]; label: string }[] = [
  { status: "green", label: "Met" },
  { status: "amber", label: "Partial" },
  { status: "red", label: "Gap" },
];

export function CoverageView({ coverage }: { coverage: CoverageItem[] }) {
  if (!coverage.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", DOT[l.status])} />
            {l.label}
          </span>
        ))}
      </div>
      <ul className="space-y-1">
        {coverage.map((c, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[c.status])} />
          <span>
            <span className="font-medium">{c.label}</span>
            {c.note ? <span className="text-muted-foreground"> — {c.note}</span> : null}
          </span>
        </li>
        ))}
      </ul>
    </div>
  );
}
