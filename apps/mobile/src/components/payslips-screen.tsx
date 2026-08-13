import { ScrollView, Text, View, Pressable, RefreshControl } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import type { MobilePayslipListResponse, MobilePayslipListItem } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { monthLabel, payslipsQueryKey } from "@/lib/payslips";
import { MONO, formatINR } from "@/lib/money";

/** Status → chip. Paid is the one solid pill (design usage rule 2). */
function statusChip(status: string): { label: string; bg: string; fg: string } {
  return status === "paid"
    ? { label: "Paid", bg: "bg-success", fg: "text-white" }
    : { label: "Processed", bg: "bg-info-tint", fg: "text-info-ontint" };
}

/**
 * Payslips list (stacked route off More; WF-Payslip list). One row per
 * non-draft entry, month-descending, from GET /api/mobile/payslips. Tap → the
 * detail route. Net pay is monospaced (design §money). No PDF in v1 (D3).
 */
export function PayslipsScreen() {
  const router = useRouter();
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  const query = useMobileQuery<MobilePayslipListResponse>(
    payslipsQueryKey(orgId),
    "/api/mobile/payslips",
    { orgId, enabled: !!orgId, staleTime: 5 * 60_000 }
  );

  const data = query.data;
  const items = data ?? [];

  // The initial-load skeleton is a fixed, short stack of placeholder boxes
  // (not a data-driven list), so it stays a plain ScrollView per the
  // FlashList sweep rule — only the unbounded payslip list below is
  // virtualized.
  if (!data && query.isLoading) {
    return (
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="px-4 pb-10 pt-3 gap-3"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
        }
      >
        <View className="gap-3">
          <View className="h-[68px] rounded-2xl bg-[#EFF1F3]" />
          <View className="h-[68px] rounded-2xl bg-[#EFF1F3]" />
          <View className="h-[68px] rounded-2xl bg-[#EFF1F3]" />
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <FlashList
        data={items}
        keyExtractor={(item) => item.entryId}
        showsVerticalScrollIndicator={false}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
              <Ionicons name="document-text-outline" size={24} color="#17806D" />
            </View>
            <Text className="mt-3 text-[15px] font-semibold text-ink-900">No payslips yet</Text>
            <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
              Your payslips appear here once your organization processes payroll.
            </Text>
          </View>
        }
        ListFooterComponent={
          query.isError && !data ? (
            <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-8">
              <Text className="text-[15px] font-semibold text-ink-900">
                Couldn&apos;t load payslips
              </Text>
              <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
                Pull to refresh once you&apos;re back online.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }: { item: MobilePayslipListItem }) => {
          const chip = statusChip(item.status);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/payslip/${item.entryId}`)}
              className="mb-3 flex-row items-center rounded-2xl border border-line bg-surface p-4 active:bg-brand-tint"
            >
              <View className="flex-1 pr-3">
                <Text className="text-[16px] font-semibold text-ink-900">
                  {monthLabel(item.month)}
                </Text>
                <View className={`mt-1.5 self-start rounded-full px-2.5 py-0.5 ${chip.bg}`}>
                  <Text className={`text-[12px] font-medium ${chip.fg}`}>{chip.label}</Text>
                </View>
              </View>
              <Text
                className="text-[17px] font-semibold text-ink-900"
                style={{ fontFamily: MONO }}
              >
                {formatINR(item.netPay)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#6A727E" style={{ marginLeft: 8 }} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
