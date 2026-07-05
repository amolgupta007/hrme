import { listAnnouncements } from "@/actions/announcements";
import { getCurrentUser } from "@/lib/current-user";
import { AnnouncementsClient } from "@/components/announcements/announcements-client";

export default async function AnnouncementsPage() {
  const [user, result] = await Promise.all([
    getCurrentUser(),
    listAnnouncements(),
  ]);

  const announcements = result.success ? result.data : [];
  const role = user?.role ?? "employee";

  return (
    <div className="space-y-6">
      <AnnouncementsClient announcements={announcements} role={role} />
    </div>
  );
}
