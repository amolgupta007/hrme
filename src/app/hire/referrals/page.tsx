import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { listOrgReferrals } from "@/actions/referrals";
import type { ReferralStatus } from "@/lib/referrals/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals — JambaHR" };

const STATUS_PILL: Record<ReferralStatus, { label: string; cls: string }> = {
  pending_apply: { label: "Pending apply", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  applied: { label: "Applied", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  in_review: { label: "In review", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  interview: { label: "Interview", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  offer: { label: "Offer", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  hired: { label: "Hired", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  withdrawn: { label: "Withdrawn", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function HireReferralsInboxPage() {
  if (!isReferralsEnabled()) notFound();

  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const result = await listOrgReferrals();
  const rows = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
          <Users className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Referrals</h1>
          <p className="text-sm text-muted-foreground">
            Candidates referred by your team. {rows.length} total.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No referrals yet. Once an employee submits one, it&apos;ll show up here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                <th className="px-4 py-2.5 text-left font-semibold">Candidate</th>
                <th className="px-4 py-2.5 text-left font-semibold">Role</th>
                <th className="px-4 py-2.5 text-left font-semibold">Referrer</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = STATUS_PILL[r.status];
                return (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3 text-foreground">
                      <div className="font-medium">{r.candidate_name}</div>
                      <div className="text-xs text-muted-foreground">{r.candidate_email}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.job_title}</td>
                    <td className="px-4 py-3 text-foreground">{r.referrer_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/hire/referrals/${r.id}`}
                        className="text-xs font-medium text-indigo-700 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
