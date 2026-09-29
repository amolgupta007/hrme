import { listAnnouncements } from "@/actions/announcements";
import { getCurrentUser } from "@/lib/current-user";
import { AnnouncementsClient } from "@/components/announcements/announcements-client";

export default async function AnnouncementsPage() {
  const [user, result] = await Promise.all([getCurrentUser(), listAnnouncements()]);

  return (
    <div className="space-y-6">
      <AnnouncementsClient
        announcements={result.success ? result.data : []}
        role={user?.role ?? "employee"}
        loadError={result.success ? null : result.error}
      />
    </div>
  );
}
