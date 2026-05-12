"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { updateFeedbackTriage } from "@/actions/feedback";
import type { FeedbackReportWithContext, FeedbackStatus, FeedbackPriority } from "@/types";

const STATUS_OPTIONS: FeedbackStatus[] = ["new", "triaged", "in_progress", "resolved", "wontfix"];
const PRIORITY_OPTIONS: (FeedbackPriority | "")[] = ["", "low", "medium", "high", "critical"];

export function FeedbackDetailClient({ row }: { row: FeedbackReportWithContext }) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(row.status);
  const [priority, setPriority] = useState<FeedbackPriority | "">(row.priority ?? "");
  const [adminNotes, setAdminNotes] = useState(row.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateFeedbackTriage(row.id, {
      status,
      priority: priority || null,
      adminNotes: adminNotes || null,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/superadmin/feedback" className="mb-4 inline-flex items-center gap-2 text-sm text-teal-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>

        <div className="rounded-lg border bg-white p-6 space-y-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">{row.type.replace("_", " ")}{row.severity ? ` · ${row.severity}` : ""}</div>
            <h1 className="mt-1 text-xl font-semibold text-gray-900">{row.title}</h1>
            <div className="mt-2 text-xs text-gray-500">
              {row.reporter_name ?? "(no employee record)"} · {row.reporter_email ?? "—"} · {row.reporter_role} · {row.org_name ?? row.org_slug ?? "—"}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Submitted {new Date(row.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              {row.page_url ? ` · from ${row.page_url}` : ""}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Description</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{row.description}</p>
          </div>

          {row.screenshot_url ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Screenshot</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.screenshot_url} alt="reporter screenshot" className="mt-2 max-w-full rounded-md border" />
            </div>
          ) : null}

          {row.user_agent ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500">User agent</div>
              <p className="mt-1 break-all text-xs text-gray-500">{row.user_agent}</p>
            </div>
          ) : null}

          <div className="border-t pt-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Triage</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-600">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm">
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-600">Priority</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value as FeedbackPriority | "")} className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm">
                  {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p === "" ? "—" : p}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="block text-xs font-medium text-gray-600">Admin notes (visible to reporter)</span>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={4}
                maxLength={4000}
                className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save triage
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
