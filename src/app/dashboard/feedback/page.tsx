import { listMyFeedback } from "@/actions/feedback";
import { MyFeedbackClient } from "@/components/feedback/my-feedback-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Feedback · JambaHR" };

export default async function MyFeedbackPage() {
  const result = await listMyFeedback();
  const rows = result.success ? result.data : [];
  const error = result.success ? null : result.error;
  return <MyFeedbackClient rows={rows} error={error} />;
}
