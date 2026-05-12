import { notFound, redirect } from "next/navigation";
import { getFeedbackForSuperadmin } from "@/actions/feedback";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { FeedbackDetailClient } from "@/components/superadmin/feedback/feedback-detail-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — Feedback Detail" };

export default async function SuperadminFeedbackDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  const result = await getFeedbackForSuperadmin(params.id);
  if (!result.success || !result.data) notFound();

  return <FeedbackDetailClient row={result.data} />;
}
