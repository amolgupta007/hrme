import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { getAnnouncementAckStatus } from "@/actions/announcements";
import { AckStatusView } from "@/components/announcements/ack-status-view";

export default async function AnnouncementStatusPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard/announcements");

  const result = await getAnnouncementAckStatus(params.id);
  if (!result.success) notFound();

  return <AckStatusView status={result.data} />;
}
