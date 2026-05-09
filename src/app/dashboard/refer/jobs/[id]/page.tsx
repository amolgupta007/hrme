import { notFound } from "next/navigation";
import Link from "next/link";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { getReferrableJob } from "@/actions/referrals";
import { ReferralForm } from "@/components/dashboard/referral-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Refer a candidate — JambaHR" };

export default async function ReferForJobPage({ params }: { params: { id: string } }) {
  if (!isReferralsEnabled()) notFound();

  const result = await getReferrableJob(params.id);
  if (!result.success) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-4">
        <Link href="/dashboard/refer/jobs" className="text-xs text-muted-foreground hover:underline">
          ← Back to roles
        </Link>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {result.error}
        </div>
      </div>
    );
  }

  const job = result.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div>
        <Link href="/dashboard/refer/jobs" className="text-xs text-muted-foreground hover:underline">
          ← Back to roles
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Refer for: {job.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[job.department_name, job.location_type, job.employment_type]
            .filter(Boolean)
            .map((s) => s!.replace("_", " "))
            .join(" · ")}
        </p>
      </div>

      <ReferralForm jobId={job.id} />

      <p className="text-xs text-muted-foreground">
        We&apos;ll email the candidate an apply link tied to your name. They&apos;ll only see what&apos;s
        public about the role; you&apos;ll see coarse progress only — never their notes, interview
        feedback, or other applicants. By submitting, you confirm you have permission to share this
        person&apos;s contact details. Self-referrals are not allowed.
      </p>
    </div>
  );
}
