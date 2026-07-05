import { notFound } from "next/navigation";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { getReferrableJobs } from "@/actions/referrals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Refer for an open role — JambaHR" };

export default async function ReferJobsPage() {
  if (!isReferralsEnabled()) notFound();

  const result = await getReferrableJobs();
  const jobs = result.success ? result.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <Link href="/dashboard/refer" className="text-xs text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Open roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a role to refer someone.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          No active roles right now. Check back soon.
        </div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link
                href={`/dashboard/refer/jobs/${j.id}`}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition hover:border-indigo-300 hover:shadow"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-indigo-700">
                    {j.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[j.department_name, j.location_type, j.employment_type]
                      .filter(Boolean)
                      .map((s) => s!.replace("_", " "))
                      .join(" · ") || "Open role"}
                  </p>
                </div>
                <span className="text-xs font-medium text-indigo-700">Refer →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
