import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { getAllRunbooks } from "@/lib/runbooks";

export const metadata = { title: "Runbooks · JambaHR Admin" };

export default function RunbooksIndexPage() {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const runbooks = getAllRunbooks();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/superadmin/dashboard"
          className="text-xs text-gray-500 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-semibold text-gray-900">Operations Runbooks</h1>
      <p className="mb-6 text-sm text-gray-500">
        Internal setup &amp; troubleshooting guides. Founder-only.
      </p>

      {runbooks.length === 0 ? (
        <p className="text-sm text-gray-500">No runbooks yet.</p>
      ) : (
        <ul className="space-y-3">
          {runbooks.map((rb) => (
            <li key={rb.slug}>
              <Link
                href={`/superadmin/runbooks/${rb.slug}`}
                className="block rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm transition hover:border-gray-300 hover:shadow"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{rb.title}</p>
                    {rb.summary && (
                      <p className="mt-1 text-sm text-gray-500">{rb.summary}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm text-teal-700">Open →</span>
                </div>
                {rb.updated && (
                  <p className="mt-2 text-xs text-gray-400">Updated {rb.updated}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
