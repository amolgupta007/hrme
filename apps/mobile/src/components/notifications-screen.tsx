import { Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import type { MobileNotification } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { routeForNotificationType, useMarkRead, useNotifications } from "@/lib/notifications";

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
 * Notifications feed (D3 Stage D). Stacked route off the Home bell and the
 * More tab's "Notifications" row. Tapping a row marks it read (if unread)
 * and deep-links by `type` via the shared `routeForNotificationType` map —
 * an unrecognized/missing type just stays on this screen (already-read is
 * still useful feedback).
 */
export function NotificationsScreen() {
  const router = useRouter();
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  const query = useNotifications(orgId);
  const markRead = useMarkRead(orgId);

  const items = query.data?.notifications ?? [];

  const onPressRow = (n: MobileNotification) => {
    if (!n.readAt) {
      markRead.mutate({ ids: [n.id] });
    }
    const route = routeForNotificationType(n.type);
    if (route) router.push(route);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      {!query.data && query.isLoading ? (
        <View className="gap-3 px-4 pt-3">
          <View className="h-[72px] rounded-2xl bg-[#EFF1F3]" />
          <View className="h-[72px] rounded-2xl bg-[#EFF1F3]" />
          <View className="h-[72px] rounded-2xl bg-[#EFF1F3]" />
        </View>
      ) : query.isError && !query.data ? (
        <View className="mx-4 mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-8">
          <Text className="text-[15px] font-semibold text-ink-900">
            Couldn&apos;t load notifications
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
            Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => query.refetch()}
            className="mt-3 rounded-full bg-brand px-4 py-2 active:bg-brand-pressed"
          >
            <Text className="text-[13px] font-semibold text-white">Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View className="mx-4 mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-10">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
            <Ionicons name="notifications-outline" size={24} color="#17806D" />
          </View>
          <Text className="mt-3 text-[15px] font-semibold text-ink-900">No notifications yet</Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
            Updates about your leave, payslips, and documents will show up here.
          </Text>
        </View>
      ) : (
        // Flash-list v2 auto-sizes cells (no `estimatedItemSize` prop on this
        // version — that was a v1-only performance hint).
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => onPressRow(item)}
              className="mb-3 flex-row items-start rounded-2xl border border-line bg-surface p-4 active:bg-brand-tint"
            >
              <View
                className={`mr-3 mt-1.5 h-2 w-2 rounded-full ${item.readAt ? "" : "bg-brand"}`}
              />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text
                    className={`flex-1 text-[15px] text-ink-900 ${
                      item.readAt ? "font-medium" : "font-semibold"
                    }`}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text className="shrink-0 text-[12px] text-ink-400">
                    {relativeTime(item.createdAt)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-[13px] leading-[18px] text-ink-600" numberOfLines={2}>
                  {item.body}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
