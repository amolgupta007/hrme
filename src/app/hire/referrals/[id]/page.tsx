import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { getReferralForAdmin } from "@/actions/referrals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referral detail — JambaHR" };

export default async function HireReferralDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isReferralsEnabled()) notFound();

  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const result = await getReferralForAdmin(params.id);
  if (!result.success) {
    return (
      <div className="space-y-4">
        <Link href="/hire/referrals" className="text-xs text-muted-foreground hover:underline">
          ← Back to referrals
        </Link>
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {result.error}
        </div>
      </div>
    );
  }

  const r = result.data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hire/referrals" className="text-xs text-muted-foreground hover:underline">
          ← Back to referrals
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{r.candidate_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Referred for {r.job_title}
          {r.referrer_name ? ` by ${r.referrer_name}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Detail label="Email">{r.candidate_email}</Detail>
        <Detail label="Phone">{r.candidate_phone ?? "—"}</Detail>
        <Detail label="LinkedIn">
          {r.linkedin_url ? (
            <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
              {r.linkedin_url}
            </a>
          ) : (
            "—"
          )}
        </Detail>
        <Detail label="Resume">
          {r.resume_url ? (
            <a href={r.resume_url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
              View
            </a>
          ) : (
            "—"
          )}
        </Detail>
        <Detail label="Status">{r.status.replace("_", " ")}</Detail>
        <Detail label="Application">
          {r.application_id ? (
            <Link href={`/hire/jobs/${r.job_id}`} className="text-indigo-700 hover:underline">
              View in pipeline →
            </Link>
          ) : (
            "Not yet applied"
          )}
        </Detail>
      </div>

      {r.note_to_recruiter && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Note from referrer
          </p>
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-foreground">
            {r.note_to_recruiter}
          </p>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{children}</p>
    </div>
  );
}
