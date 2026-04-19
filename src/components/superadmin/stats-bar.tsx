import type { SuperadminStats } from "@/lib/superadmin-data";

const cards: { label: string; key: keyof SuperadminStats }[] = [
  { label: "Total Orgs", key: "total" },
  { label: "Starter", key: "starter" },
  { label: "Growth", key: "growth" },
  { label: "Business", key: "business" },
  { label: "This Week", key: "signupsThisWeek" },
  { label: "This Month", key: "signupsThisMonth" },
];

export function StatsBar({ stats }: { stats: SuperadminStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, key }) => (
        <div
          key={key}
          className="rounded-lg border border-gray-200 bg-white px-4 py-5 shadow-sm"
        >
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {stats[key]}
          </p>
        </div>
      ))}
    </div>
  );
}
