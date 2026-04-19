import type { OrgWithStats } from "@/lib/superadmin-data";
import { formatDateIST } from "@/lib/superadmin-data";

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  business: "bg-teal-100 text-teal-700",
};

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PLAN_STYLES[plan] ?? "bg-gray-100 text-gray-700"}`}
    >
      {plan}
    </span>
  );
}


export function SignupsTable({ orgs }: { orgs: OrgWithStats[] }) {
  if (orgs.length === 0) {
    return <p className="text-sm text-gray-500">No signups yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Company", "Owner Email", "Plan", "Employees", "Signed Up"].map((h) => (
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
          {orgs.map((org) => (
            <tr key={org.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
              <td className="px-4 py-3 text-gray-600">
                {org.owner_email ?? <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <PlanBadge plan={org.plan} />
              </td>
              <td className="px-4 py-3 text-gray-700">{org.employee_count}</td>
              <td className="px-4 py-3 text-gray-500">{formatDateIST(org.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
