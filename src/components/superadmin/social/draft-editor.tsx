"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateDraft,
  regenerateCaption,
  regenerateImage,
  approveAndSchedule,
  rejectPost,
} from "@/actions/social";
import type { SocialPost } from "@/lib/social/types";

interface Props {
  post: SocialPost;
}

const CAPTION_TARGET = 1200;
const CAPTION_HARD_CAP = 2800;

export function DraftEditor({ post: initialPost }: Props) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [caption, setCaption] = useState(initialPost.caption);
  const [hashtagsText, setHashtagsText] = useState(initialPost.hashtags.join(" "));
  const [imageAlt, setImageAlt] = useState(initialPost.image_alt_text ?? "");
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showRegenCaption, setShowRegenCaption] = useState(false);
  const [showRegenImage, setShowRegenImage] = useState(false);
  const [pending, startTransition] = useTransition();

  const isReadOnly =
    post.status === "scheduled" ||
    post.status === "publishing" ||
    post.status === "published" ||
    post.status === "rejected";

  const dirty =
    caption !== post.caption ||
    hashtagsText !== post.hashtags.join(" ") ||
    imageAlt !== (post.image_alt_text ?? "");

  const parseHashtags = (raw: string) =>
    raw
      .split(/[\s,]+/)
      .map((s) => s.replace(/^#+/, "").trim())
      .filter(Boolean);

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateDraft(post.id, {
        caption,
        hashtags: parseHashtags(hashtagsText),
        imageAlt,
      });
      if (res.success) {
        setPost(res.data);
        setCaption(res.data.caption);
        setHashtagsText(res.data.hashtags.join(" "));
        setImageAlt(res.data.image_alt_text ?? "");
        toast.success("Draft saved");
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleRegenerateCaption = (instruction?: string) => {
    setShowRegenCaption(false);
    startTransition(async () => {
      const res = await regenerateCaption(post.id, instruction || undefined);
      if (res.success) {
        setPost(res.data);
        setCaption(res.data.caption);
        setHashtagsText(res.data.hashtags.join(" "));
        setImageAlt(res.data.image_alt_text ?? "");
        toast.success("Caption regenerated");
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleRegenerateImage = (instruction?: string) => {
    setShowRegenImage(false);
    startTransition(async () => {
      const res = await regenerateImage(post.id, instruction || undefined);
      if (res.success) {
        setPost(res.data);
        toast.success("Image regenerated");
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleApprove = (mode: "queue" | "customScheduled", dueAt?: string) => {
    setShowApprove(false);
    startTransition(async () => {
      const res = await approveAndSchedule(post.id, { mode, dueAt });
      if (res.success) {
        toast.success("Approved and pushed to Buffer queue");
        router.push("/superadmin/social?tab=scheduled");
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleReject = (reason: string) => {
    setShowReject(false);
    startTransition(async () => {
      const res = await rejectPost(post.id, reason);
      if (res.success) {
        toast.success("Rejected");
        router.push("/superadmin/social?tab=pending");
      } else {
        toast.error(res.error);
      }
    });
  };

  const captionWarn = caption.length > CAPTION_TARGET;
  const captionOver = caption.length > CAPTION_HARD_CAP;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Edit column */}
      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">Caption</label>
          <textarea
            value={caption}
            disabled={isReadOnly || pending}
            onChange={(e) => setCaption(e.target.value)}
            rows={12}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none disabled:bg-gray-50"
          />
          <p
            className={`mt-1 text-xs ${
              captionOver ? "text-red-600" : captionWarn ? "text-amber-600" : "text-gray-500"
            }`}
          >
            {caption.length} / {CAPTION_TARGET} target ({CAPTION_HARD_CAP} hard cap)
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            Hashtags <span className="text-xs font-normal text-gray-400">(space-separated)</span>
          </label>
          <input
            type="text"
            value={hashtagsText}
            disabled={isReadOnly || pending}
            onChange={(e) => setHashtagsText(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none disabled:bg-gray-50"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">Image alt text</label>
          <input
            type="text"
            value={imageAlt}
            disabled={isReadOnly || pending}
            onChange={(e) => setImageAlt(e.target.value)}
            maxLength={140}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none disabled:bg-gray-50"
          />
        </div>

        {!isReadOnly && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={!dirty || pending}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              onClick={() => setShowRegenCaption(true)}
              disabled={pending}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400"
            >
              Regenerate caption
            </button>
            <button
              onClick={() => setShowRegenImage(true)}
              disabled={pending}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400"
            >
              Regenerate image
            </button>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setShowReject(true)}
                disabled={pending}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Reject
              </button>
              <button
                onClick={() => setShowApprove(true)}
                disabled={pending || dirty || !post.image_url}
                className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                title={dirty ? "Save changes first" : !post.image_url ? "Regenerate the image first" : ""}
              >
                Approve & schedule
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preview column */}
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">LinkedIn preview</p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-teal-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">JambaHR</p>
              <p className="text-xs text-gray-500">HR-tech for Indian SMBs · Just now</p>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-900">{caption}</p>
          {parseHashtags(hashtagsText).length > 0 && (
            <p className="mt-2 text-sm text-blue-700">
              {parseHashtags(hashtagsText).map((h) => `#${h}`).join(" ")}
            </p>
          )}
          {post.image_url && (
            <img
              src={post.image_url}
              alt={imageAlt}
              className="mt-3 w-full rounded-md border border-gray-200 object-cover"
            />
          )}
        </div>
        {post.error_message && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠ {post.error_message}
          </p>
        )}
      </div>

      {/* Modals */}
      {showApprove && (
        <ApproveModal
          onCancel={() => setShowApprove(false)}
          onSubmit={handleApprove}
          pending={pending}
        />
      )}
      {showReject && (
        <RejectModal
          onCancel={() => setShowReject(false)}
          onSubmit={handleReject}
          pending={pending}
        />
      )}
      {showRegenCaption && (
        <RegenerateModal
          title="Regenerate caption"
          onCancel={() => setShowRegenCaption(false)}
          onSubmit={handleRegenerateCaption}
          pending={pending}
        />
      )}
      {showRegenImage && (
        <RegenerateModal
          title="Regenerate image"
          onCancel={() => setShowRegenImage(false)}
          onSubmit={handleRegenerateImage}
          pending={pending}
        />
      )}
    </div>
  );
}

function ApproveModal({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (mode: "queue" | "customScheduled", dueAt?: string) => void;
  pending: boolean;
}) {
  const [mode, setMode] = useState<"queue" | "customScheduled">("queue");
  const [dueAt, setDueAt] = useState("");

  return (
    <ModalShell title="Approve & schedule" onCancel={onCancel}>
      <div className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "queue"}
            onChange={() => setMode("queue")}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Queue</span> — Buffer fills its next available slot per the
            channel's posting schedule.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "customScheduled"}
            onChange={() => setMode("customScheduled")}
            className="mt-1"
          />
          <span className="flex-1">
            <span className="font-medium">Specific time</span>
            {mode === "customScheduled" && (
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-2 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            )}
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const iso = mode === "customScheduled" && dueAt ? new Date(dueAt).toISOString() : undefined;
              onSubmit(mode, iso);
            }}
            disabled={pending || (mode === "customScheduled" && !dueAt)}
            className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function RejectModal({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell title="Reject draft" onCancel={onCancel}>
      <textarea
        rows={4}
        placeholder="Why is this not shipping? (saved on the record)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(reason)}
          disabled={pending || reason.trim().length < 3}
          className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </ModalShell>
  );
}

function RegenerateModal({
  title,
  onCancel,
  onSubmit,
  pending,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: (instruction?: string) => void;
  pending: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  return (
    <ModalShell title={title} onCancel={onCancel}>
      <p className="mb-2 text-xs text-gray-500">
        Optional steer — leave blank for a fresh take.
      </p>
      <textarea
        rows={3}
        placeholder='e.g. "More direct hook, mention specific PF rate"'
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(instruction.trim() || undefined)}
          disabled={pending}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Regenerate
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold text-gray-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}
