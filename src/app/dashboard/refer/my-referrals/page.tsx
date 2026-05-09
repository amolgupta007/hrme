import { notFound } from "next/navigation";
import Link from "next/link";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { listMyReferrals } from "@/actions/referrals";
import { COARSE_LABEL, type CoarseStatus } from "@/lib/referrals/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "My referrals — JambaHR" };

const STATUS_CLASSES: Record<CoarseStatus, string> = {
  submitted: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  being_reviewed: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  progressing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  closed_hired: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  closed_no_match: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function MyReferralsPage() {
  if (!isReferralsEnabled()) notFound();

  const result = await listMyReferrals();
  const rows = result.success ? result.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <Link href="/dashboard/refer" className="text-xs text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">My referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Coarse status only — your visibility is intentionally limited to protect candidates and other applicants.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          You haven&apos;t referred anyone yet.{" "}
          <Link href="/dashboard/refer/jobs" className="text-indigo-700 hover:underline">
            Browse open roles →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                <th className="px-4 py-2.5 text-left font-semibold">Candidate</th>
                <th className="px-4 py-2.5 text-left font-semibold">Role</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-foreground">{r.candidate_name}</td>
                  <td className="px-4 py-3 text-foreground">{r.job_title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[r.coarse_status]}`}
                    >
                      {COARSE_LABEL[r.coarse_status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
