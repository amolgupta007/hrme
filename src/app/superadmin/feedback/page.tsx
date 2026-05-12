import { redirect } from "next/navigation";
import { listAllFeedback } from "@/actions/feedback";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { FeedbackListClient } from "@/components/superadmin/feedback/feedback-list-client";
import type { FeedbackStatus } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — Feedback" };

type FilterValue = "all" | string;

export default async function SuperadminFeedbackPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string; severity?: string };
}) {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const status = (searchParams.status as FilterValue) ?? "all";
  const type = (searchParams.type as FilterValue) ?? "all";
  const severity = (searchParams.severity as FilterValue) ?? "all";

  const result = await listAllFeedback({
    status: status as FeedbackStatus | "all",
    type: type as "bug" | "feature_request" | "feedback" | "other" | "all",
    severity: severity as "low" | "medium" | "high" | "critical" | "all",
  });

  return (
    <FeedbackListClient
      rows={result.success ? result.data : []}
      error={result.success ? null : result.error}
      filters={{ status, type, severity }}
    />
  );
}
