import { getAllOrgsWithStats, computeStats, getUpsellTargets } from "@/lib/superadmin-data";
import { StatsBar } from "@/components/superadmin/stats-bar";
import { SignupsTable } from "@/components/superadmin/signups-table";
import { UpsellTargetsTable } from "@/components/superadmin/upsell-targets-table";

export const dynamic = "force-dynamic";

async function LogoutButton() {
  return (
    <form action="/api/superadmin/logout" method="POST">
      <button
        type="submit"
        className="text-sm text-gray-500 hover:text-gray-700 underline"
      >
        Sign out
      </button>
    </form>
  );
}

export default async function SuperadminDashboard() {
  const orgs = await getAllOrgsWithStats();
  const stats = computeStats(orgs);
  const upsellTargets = getUpsellTargets(orgs);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">JambaHR Admin</h1>
            <p className="text-sm text-gray-500">Internal analytics — not customer-facing</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-8">
        {/* Stats */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Overview
          </h2>
          <StatsBar stats={stats} />
        </section>

        {/* Upsell targets */}
        <section>
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            Upsell Targets
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Starter orgs with ≥7 employees (near limit) or ≥3 employees and 30+ days old (engaged, not converted).
          </p>
          <UpsellTargetsTable targets={upsellTargets} />
        </section>

        {/* All signups */}
        <section>
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            All Signups
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {orgs.length} total org{orgs.length !== 1 ? "s" : ""} — newest first.
          </p>
          <SignupsTable orgs={orgs} />
        </section>
      </main>
    </div>
  );
}
