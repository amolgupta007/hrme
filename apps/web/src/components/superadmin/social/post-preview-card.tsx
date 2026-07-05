import Link from "next/link";
import type { SocialPost } from "@/lib/social/types";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending_approval: { bg: "#fef3c7", text: "#92400e", label: "Needs review" },
  approved: { bg: "#dbeafe", text: "#1e40af", label: "Approved" },
  scheduled: { bg: "#dbeafe", text: "#1e40af", label: "Scheduled" },
  publishing: { bg: "#fef3c7", text: "#92400e", label: "Publishing…" },
  published: { bg: "#dcfce7", text: "#166534", label: "Published" },
  failed: { bg: "#fee2e2", text: "#991b1b", label: "Failed" },
  rejected: { bg: "#f3f4f6", text: "#6b7280", label: "Rejected" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PostPreviewCard({ post }: { post: SocialPost }) {
  const status = STATUS_STYLES[post.status] ?? STATUS_STYLES.pending_approval;
  const excerpt = post.caption.length > 180 ? post.caption.slice(0, 180) + "…" : post.caption;

  return (
    <Link
      href={`/superadmin/social/${post.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow"
    >
      <div className="flex gap-4">
        {post.image_url ? (
          <img
            src={post.image_url}
            alt={post.image_alt_text ?? ""}
            className="h-24 w-24 flex-shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">
            No image
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: status.bg, color: status.text }}
            >
              {status.label}
            </span>
            <span className="text-xs text-gray-400">{formatDate(post.created_at)}</span>
          </div>

          <p className="line-clamp-3 text-sm text-gray-800">{excerpt}</p>

          {post.hashtags.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              {post.hashtags.slice(0, 4).map((h) => `#${h.replace(/^#+/, "")}`).join(" ")}
            </p>
          )}

          {post.error_message && (
            <p className="mt-2 text-xs text-red-700">⚠ {post.error_message}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
