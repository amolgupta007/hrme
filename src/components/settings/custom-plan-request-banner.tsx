import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { CustomPlanRequest } from "@/actions/custom-plan";

const STATUS_COPY: Record<
  CustomPlanRequest["status"],
  { title: string; body: string; tone: "amber" | "primary" | "green" }
> = {
  pending: {
    title: "Custom plan under review",
    body: "We'll respond within 1 business day.",
    tone: "amber",
  },
  counter_offered: {
    title: "Counter-offer ready",
    body: "We've proposed adjusted terms — review and accept.",
    tone: "primary",
  },
  accepted: {
    title: "Counter-offer accepted",
    body: "Awaiting founder activation.",
    tone: "primary",
  },
  approved: {
    title: "Custom plan approved",
    body: "Check your email for the checkout link.",
    tone: "green",
  },
  rejected: { title: "", body: "", tone: "amber" },
  cancelled: { title: "", body: "", tone: "amber" },
};

const TONE_CLASS: Record<"amber" | "primary" | "green", string> = {
  amber: "border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10",
  primary: "border-primary/30 bg-primary/5",
  green: "border-green-300/60 bg-green-50/40 dark:bg-green-900/10",
};

export function CustomPlanRequestBanner({ request }: { request: CustomPlanRequest }) {
  const copy = STATUS_COPY[request.status];
  if (!copy.title) return null;

  return (
    <Link
      href="/dashboard/settings/custom-plan"
      className={`flex items-center justify-between gap-4 rounded-xl border p-5 hover:opacity-90 transition ${TONE_CLASS[copy.tone]}`}
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
