import type { UpsellTarget } from "@/lib/superadmin-data";

const REASON_LABELS: Record<string, { label: string; style: string }> = {
  near_limit: {
    label: "Near limit",
    style: "bg-red-100 text-red-700",
  },
  engaged_starter: {
    label: "Engaged starter",
    style: "bg-amber-100 text-amber-700",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function UpsellTargetsTable({ targets }: { targets: UpsellTarget[] }) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No upsell targets right now. Great news — no one is near their limit.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Company", "Owner Email", "Employees / 10", "Signed Up", "Signal"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {targets.map((org) => {
            const { label, style } = REASON_LABELS[org.reason];
            const pct = Math.round((org.employee_count / 10) * 100);
            return (
              <tr key={org.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {org.owner_email ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-700">
                      {org.employee_count} / 10
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(org.created_at)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
                  >
                    {label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
