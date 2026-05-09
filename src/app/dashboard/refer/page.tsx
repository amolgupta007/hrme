import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ListChecks, UserPlus } from "lucide-react";
import { isReferralsEnabled } from "@/lib/feature-flags";

export const metadata = { title: "Refer — JambaHR" };

export default function ReferLandingPage() {
  if (!isReferralsEnabled()) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Know someone who&apos;d be great here?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Refer them in 30 seconds. They&apos;ll get a tracked apply link. You&apos;ll see coarse
          progress on your dashboard — never their notes, interview feedback, or other applicants.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">How it works</h2>
        <ol className="mt-3 space-y-3 text-sm text-foreground">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950">1</span>
            <span>Browse open roles at your company.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950">2</span>
            <span>Submit a candidate (name, email, optional resume).</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950">3</span>
            <span>We email them a tracked apply link.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950">4</span>
            <span>Track coarse status from your dashboard.</span>
          </li>
        </ol>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/refer/jobs"
          className="group flex items-start gap-3 rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground group-hover:text-indigo-700">
              Browse open roles
            </p>
            <p className="mt-1 text-xs text-muted-foreground">See what&apos;s hiring and refer in.</p>
          </div>
          <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
        </Link>

        <Link
          href="/dashboard/refer/my-referrals"
          className="group flex items-start gap-3 rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60">
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground group-hover:text-emerald-700">
              My referrals
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Track coarse status of past referrals.</p>
          </div>
          <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
