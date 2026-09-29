import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { MyLateStatus } from "@/actions/late-policy";

/**
 * "3 of 5 late arrivals this month" for the employee's own attendance view.
 * Only rendered when at least one late arrival counts this month.
 */
export function MyLateBanner({ status }: { status: MyLateStatus }) {
  const { lateCount } = status;
  let limit: number;
  let consequence: string;
  if (status.mode === "ladder" && status.deductAt) {
    // Next deduction step (every Nth late when it repeats).
    limit = Math.max(status.deductAt, Math.ceil((lateCount + 1) / status.deductAt) * status.deductAt);
    const days = status.deductDays ?? 1;
    consequence = `${days} ${days === 1 ? "day" : "days"} of ${status.leaveLabel ?? "leave"} is deducted (loss of pay if none is left)`;
  } else {
    limit = status.thresholdDays ?? 0;
    consequence = "the late-arrival policy applies";
  }
  const reached = status.mode === "threshold" && lateCount >= limit;
  const near = !reached && limit - lateCount <= 1;
  const pct = limit > 0 ? Math.min(100, (lateCount / limit) * 100) : 0;

  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border px-4 py-3",
        reached || near ? "border-destructive/30 bg-destructive/5" : "border-warning/40 bg-warning/10"
      )}
    >
      <div className="flex items-start gap-3">
        {reached || near ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        ) : (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground dark:text-warning" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {reached
              ? `${lateCount} late arrivals this month — the monthly limit of ${limit} is reached`
              : `${lateCount} of ${limit} late arrivals this month`}
          </p>
          {!reached && (
            <p className="text-xs text-muted-foreground">
              At {limit}, {consequence}. Week-offs, holidays and approved leave don&apos;t count. If a late mark is wrong,
              speak to your manager.
            </p>
          )}
          <Progress value={pct} className="mt-2 h-1.5" indicatorClassName={reached || near ? "bg-destructive" : "bg-warning"} />
        </div>
      </div>
    </div>
  );
}
