import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { hasPermission } from "@jambahr/shared";
import type { MobileHomeResponse } from "@jambahr/shared/mobile/types";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { homeQueryKey } from "@/lib/home";
import { usePunch } from "@/lib/use-punch";
import { TodayCard } from "@/components/today-card";
import { QuickActions } from "@/components/quick-actions";
import { PendingCard } from "@/components/pending-card";
import { HolidayCard } from "@/components/holiday-card";
import { AnnouncementsCard } from "@/components/announcements-card";
import { AdminHomeCards } from "@/components/admin/admin-home-cards";

const STUB_TITLE = "Coming soon";
const STUB_BODY = "This is coming in the next update.";

/** "Fri, 17 Jul" (2a design: `{weekday, date} · {org}` on one line). */
function dateLabel(): string {
  return new Date().toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Shared Home for both staff and admin tabs (admins punch too). `isAdmin`
 * only adds a one-line note that admin dashboard widgets arrive later in
 * Phase D — the TodayCard + quick actions are identical.
 *
 * Renders instantly from the persisted TanStack cache; the skeleton shows
 * only on a true first run (no cached data yet).
 */
export function HomeScreen({ isAdmin = false }: { isAdmin?: boolean }) {
  const { userId } = useAuth();
  const { me } = useSession();
  const router = useRouter();
  const orgId = me?.orgId ?? null;

  const home = useMobileQuery<MobileHomeResponse>(
    homeQueryKey(orgId),
    "/api/mobile/home",
    { orgId, staleTime: 60_000, enabled: !!orgId }
  );

  const {
    punch,
    isPunching,
    queueCount,
    showSyncFailedBanner,
    punchError,
    clearPunchError,
  } = usePunch({ namespace: userId ?? "signed-out", orgId });

  const firstName = me?.employee?.firstName ?? "there";
  const stub = () => Alert.alert(STUB_TITLE, STUB_BODY);

  const data = home.data;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-2 gap-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={home.isRefetching} onRefresh={() => home.refetch()} />
        }
      >
        {/* Greeting (2a: "Hi, {name}" + "{weekday, date} · {org}") + the D3
            push notification bell */}
        <View className="flex-row items-center justify-between pt-2">
          <View className="flex-1">
            <Text className="text-[28px] font-bold leading-8 text-ink-900" numberOfLines={1}>
              Hi, {firstName}
            </Text>
            <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={1}>
              {dateLabel()}
              {me?.orgName ? ` · ${me.orgName}` : ""}
              {isAdmin ? " · Admin" : ""}
            </Text>
          </View>
          <View className="ml-3 flex-row items-center">
            <NotificationBell
              count={data?.unreadNotifications ?? 0}
              onPress={() => router.push("/notifications")}
            />
            <View className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-brand">
              <Text className="text-[15px] font-bold text-white">
                {firstName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Persistent banners */}
        {showSyncFailedBanner ? (
          <View className="flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
            <Ionicons name="cloud-offline-outline" size={18} color="#B91C1C" />
            <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">
              Can&apos;t sync your punches right now. We&apos;ll keep retrying.
            </Text>
          </View>
        ) : null}
        {punchError ? (
          <Pressable
            onPress={clearPunchError}
            className="flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5"
          >
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{punchError}</Text>
            <Ionicons name="close" size={16} color="#B91C1C" />
          </Pressable>
        ) : null}

        {!data && (home.isLoading || !orgId) ? (
          <HomeSkeleton />
        ) : data ? (
          <>
            {data.adminHome && me && hasPermission(me.role, "manager") ? (
              <AdminHomeCards data={data.adminHome} />
            ) : null}

            <StatStrip
              leaveLeft={data.leave.balances.reduce((s, b) => s + (b.remaining ?? 0), 0)}
              pendingApprovals={data.pendingApprovals}
              trainingsOverdue={data.trainingsOverdue}
            />

            <QuickActions
              onRequestLeave={() => router.push("/(tabs)/leaves")}
              onViewPayslip={() => router.push("/payslips")}
            />

            <TodayCard
              today={data.today}
              syncing={queueCount > 0}
              isPunching={isPunching}
              onPunch={punch}
              onPress={() => router.push("/attendance")}
            />

            <PendingCard
              pendingApprovals={data.pendingApprovals}
              trainingsOverdue={data.trainingsOverdue}
              leaveRequests={data.pending.leaveRequests}
              regularizations={data.pending.regularizations}
              onApprovalsPress={() => router.push("/(tabs)/leaves?segment=approvals")}
            />

            <AnnouncementsCard announcements={data.announcements} onSeeAll={stub} />

            {data.nextHolidays[0] ? <HolidayCard holiday={data.nextHolidays[0]} /> : null}
          </>
        ) : (
          <View className="rounded-2xl border border-line bg-surface p-4">
            <Text className="text-[15px] text-ink-600">
              Couldn&apos;t load your home right now. Pull to refresh once you&apos;re back
              online.
            </Text>
          </View>
        )}

        {isAdmin ? (
          <Text className="px-1 text-[13px] text-ink-400">
            Admin dashboard widgets arrive later in Phase D.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 2a three-stat strip: leave days left (always), "to approve" (managers
 * only — `pendingApprovals === null` hides the cell for employees),
 * trainings overdue (always — see `MobileHomeResponse.trainingsOverdue`
 * doc-comment for why this one is never omitted/faked).
 */
function StatStrip({
  leaveLeft,
  pendingApprovals,
  trainingsOverdue,
}: {
  leaveLeft: number;
  pendingApprovals: number | null;
  trainingsOverdue: number;
}) {
  return (
    <View className="flex-row gap-2">
      <StatTile label="leave days left" value={leaveLeft} />
      {pendingApprovals !== null ? (
        <StatTile label="to approve" value={pendingApprovals} color="#B45309" />
      ) : null}
      <StatTile label="trainings overdue" value={trainingsOverdue} color="#DC2626" />
    </View>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface p-3">
      <Text
        className="text-[24px] font-extrabold leading-7 text-ink-900"
        style={color ? { color } : undefined}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text className="mt-0.5 text-[12px] leading-4 text-ink-600" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Home header bell (D3 Stage D) — unread count from the home payload, capped at "9+". */
function NotificationBell({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      onPress={onPress}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-brand-tint"
    >
      <Ionicons name="notifications-outline" size={22} color="#0B1220" />
      {count > 0 ? (
        <View className="absolute right-1 top-1 h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1">
          <Text className="text-[10px] font-bold leading-3 text-white">
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-2">
        <View className="h-[72px] flex-1 rounded-2xl bg-[#EFF1F3]" />
        <View className="h-[72px] flex-1 rounded-2xl bg-[#EFF1F3]" />
        <View className="h-[72px] flex-1 rounded-2xl bg-[#EFF1F3]" />
      </View>
      <View className="h-11 rounded-xl bg-[#EFF1F3]" />
      <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
      <View className="h-24 rounded-2xl bg-[#EFF1F3]" />
    </View>
  );
}
