"use client";

import { formatDistanceToNow } from "date-fns";
import { Bug, Sparkles, MessageCircle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-context";
import type { FeedbackReport, FeedbackStatus } from "@/types";

const TYPE_ICON: Record<FeedbackReport["type"], React.ReactNode> = {
  bug: <Bug className="h-4 w-4 text-red-500" />,
  feature_request: <Sparkles className="h-4 w-4 text-amber-500" />,
  feedback: <MessageCircle className="h-4 w-4 text-blue-500" />,
  other: <FileText className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_VARIANT: Record<FeedbackStatus, "default" | "secondary" | "success" | "warning"> = {
  new: "secondary",
  triaged: "warning",
  in_progress: "warning",
  resolved: "success",
  wontfix: "default",
};

export function MyFeedbackClient({ rows, error }: { rows: FeedbackReport[]; error: string | null }) {
  const { openDialog } = useFeedback();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Feedback</h1>
          <p className="text-sm text-muted-foreground">Bug reports, feature requests, and notes you&apos;ve sent us.</p>
        </div>
        <Button onClick={openDialog}>Send feedback</Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No reports yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Help us improve — send your first one.</p>
          <Button className="mt-4" onClick={openDialog}>Send feedback</Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium w-8" />
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{TYPE_ICON[r.type]}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.title}</div>
                    {r.admin_notes ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Admin note: </span>{r.admin_notes}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
