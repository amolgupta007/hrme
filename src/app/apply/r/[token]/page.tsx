import { notFound } from "next/navigation";
import { getReferralByToken } from "@/actions/referrals";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { ApplyForm } from "@/components/apply/apply-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply — JambaHR" };

export default async function ApplyByTokenPage({ params }: { params: { token: string } }) {
  if (!isReferralsEnabled()) notFound();

  const result = await getReferralByToken(params.token);

  if (!result.success) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-900">Referral link not found</h1>
        <p className="mt-2 text-sm text-gray-600">{result.error}</p>
        <p className="mt-4 text-xs text-gray-500">
          If you got this link in an email, double-check the URL is complete. Reply to the
          original email if you need a fresh link.
        </p>
      </Shell>
    );
  }

  const r = result.data;

  if (r.status !== "pending_apply") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-900">This link has already been used</h1>
        <p className="mt-2 text-sm text-gray-600">
          You&apos;ve already applied via this referral. The hiring team has your application —
          they&apos;ll be in touch.
        </p>
      </Shell>
    );
  }

  if (r.job_status !== "active") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-900">This role is no longer accepting applications</h1>
        <p className="mt-2 text-sm text-gray-600">
          The {r.job_title} role at {r.org_name} has been closed or paused.{" "}
          {r.org_slug && (
            <>
              See other open roles at{" "}
              <a href={`/careers/${r.org_slug}`} className="text-indigo-700 hover:underline">
                /careers/{r.org_slug}
              </a>
              .
            </>
          )}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs uppercase tracking-wide text-indigo-700">
        {r.referrer_first_name ? `${r.referrer_first_name} referred you` : "You were referred"}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">
        {r.job_title} at {r.org_name}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        We&apos;ve pre-filled what we know. Take a minute to confirm and add anything missing,
        then hit Apply.
      </p>

      <div className="mt-6">
        <ApplyForm
          token={params.token}
          defaults={{
            name: r.candidate_name,
            email: r.candidate_email,
            phone: r.candidate_phone ?? "",
            linkedin: r.linkedin_url ?? "",
            resume: r.resume_url ?? "",
          }}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-lg border border-gray-200 bg-white px-8 py-10 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
