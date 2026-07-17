import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@clerk/clerk-expo";
import type { MobileHomeResponse } from "@jambahr/shared/mobile/types";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { homeQueryKey } from "@/lib/home";
import { usePunch } from "@/lib/use-punch";
import { TodayCard } from "@/components/today-card";
import { QuickActions } from "@/components/quick-actions";
import { PendingCard } from "@/components/pending-card";
import { HolidayCard } from "@/components/holiday-card";

const STUB_TITLE = "Coming soon";
const STUB_BODY = "This is coming in the next update.";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
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
      >
        {/* Greeting */}
        <View className="flex-row items-start justify-between pt-2">
          <View className="flex-1">
            <Text className="text-[13px] font-normal text-ink-600">{todayLabel()}</Text>
            <Text className="mt-0.5 text-[28px] font-extrabold text-ink-900" numberOfLines={1}>
              {greeting()}, {firstName} 👋
            </Text>
            <Text className="mt-0.5 text-[15px] text-ink-600" numberOfLines={1}>
              {me?.orgName ?? ""}
              {isAdmin ? " · Admin" : ""}
            </Text>
          </View>
          <View className="ml-3 h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
            <Text className="text-[15px] font-bold text-brand-pressed">
              {firstName.charAt(0).toUpperCase()}
            </Text>
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
            <StatStrip
              leaveLeft={data.leave.balances.reduce((s, b) => s + (b.remaining ?? 0), 0)}
              pending={data.pending.leaveRequests + data.pending.regularizations}
            />

            <TodayCard today={data.today} syncing={queueCount > 0} />

            <QuickActions
              isClockedIn={data.today.isClockedIn}
              isPunching={isPunching}
              onPunch={punch}
              onApplyLeave={stub}
              onPayslips={stub}
            />

            <PendingCard
              leaveRequests={data.pending.leaveRequests}
              regularizations={data.pending.regularizations}
            />

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

function StatStrip({ leaveLeft, pending }: { leaveLeft: number; pending: number }) {
  return (
    <View className="flex-row gap-3">
      <StatTile label="Leave left" value={leaveLeft} unit="days" />
      <StatTile label="Pending" value={pending} unit={pending === 1 ? "item" : "items"} />
    </View>
  );
}

function StatTile({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface p-4">
      <Text className="text-[13px] font-normal text-ink-600">{label}</Text>
      <View className="mt-1 flex-row items-end">
        <Text className="text-[28px] font-extrabold leading-8 text-ink-900">{value}</Text>
        <Text className="ml-1 mb-1 text-[13px] text-ink-600">{unit}</Text>
      </View>
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
        <View className="h-20 flex-1 rounded-2xl bg-[#EFF1F3]" />
        <View className="h-20 flex-1 rounded-2xl bg-[#EFF1F3]" />
      </View>
      <View className="h-28 rounded-2xl bg-[#EFF1F3]" />
      <View className="h-[50px] rounded-[14px] bg-[#EFF1F3]" />
      <View className="h-24 rounded-2xl bg-[#EFF1F3]" />
    </View>
  );
}
