import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { getRunbook } from "@/lib/runbooks";

export const metadata = { title: "Runbook · JambaHR Admin" };

export default async function RunbookDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const runbook = await getRunbook(params.slug);
  if (!runbook) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/superadmin/runbooks"
          className="text-xs text-gray-500 hover:underline"
        >
          ← Back to runbooks
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-semibold text-gray-900">{runbook.title}</h1>
      {runbook.updated && (
        <p className="mb-6 text-xs text-gray-400">Updated {runbook.updated}</p>
      )}

      <article
        className="prose prose-sm max-w-none prose-headings:font-semibold prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-table:text-sm"
        dangerouslySetInnerHTML={{ __html: runbook.contentHtml }}
      />
    </main>
  );
}
