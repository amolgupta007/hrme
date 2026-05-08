import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost } from "@/actions/social";
import { DraftEditor } from "@/components/superadmin/social/draft-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — Edit social draft" };

export default async function SuperadminSocialDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const result = await getPost(params.id);
  if (!result.success) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-600">
        {result.error}
      </div>
    );
  }
  if (!result.data) notFound();

  const post = result.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <Link href="/superadmin/social" className="text-xs text-gray-500 hover:underline">
            ← Back to queue
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-gray-900">Edit draft</h1>
          <p className="text-sm text-gray-500">
            Status: {post.status.replace("_", " ")} · Created{" "}
            {new Date(post.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <DraftEditor post={post} />
      </main>
    </div>
  );
}
