import { Pressable, Text, View } from "react-native";
import type { MobileAnnouncementLite } from "@jambahr/shared/mobile/types";

const CATEGORY_LABEL: Record<string, string> = {
  general: "General",
  policy: "Policy",
  event: "Event",
  urgent: "Urgent",
};

/** "2026-08-01T10:00:00Z" → "2h ago" / "3d ago" / "2w ago" (device-local). */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, Date.now() - then);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/**
 * Announcements section (2a design — new vs D1 Home). "See all" is a stub
 * until a dedicated announcements screen exists; renders nothing when the
 * org has none rather than an empty-state card (keeps Home short).
 */
export function AnnouncementsCard({
  announcements,
  onSeeAll,
}: {
  announcements: MobileAnnouncementLite[];
  onSeeAll?: () => void;
}) {
  if (announcements.length === 0) return null;

  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[17px] font-bold text-ink-900">Announcements</Text>
        {onSeeAll ? (
          <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
            <Text className="text-[13px] font-semibold text-brand">See all</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="mt-2 gap-2">
        {announcements.map((a) => (
          <View key={a.id} className="rounded-2xl border border-line bg-surface p-4">
            <View className="flex-row items-center gap-2">
              <View className="rounded-full bg-info-tint px-2 py-0.5">
                <Text className="text-[11px] font-medium text-info-ontint">
                  {a.category ? (CATEGORY_LABEL[a.category] ?? a.category) : "Company"}
                </Text>
              </View>
              <Text className="text-[12px] text-ink-400">{relativeTime(a.createdAt)}</Text>
            </View>
            <Text className="mt-1.5 text-[15px] font-semibold text-ink-900" numberOfLines={1}>
              {a.title}
            </Text>
            <Text className="mt-0.5 text-[13px] leading-[18px] text-ink-600" numberOfLines={2}>
              {a.body}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
