import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { hasPermission } from "@jambahr/shared";
import { istToday } from "@jambahr/shared/attendance/ist";
import type {
  MobileLeaveApprovalsResponse,
  MobileLeaveRequestItem,
  MobileLeaveResponse,
} from "@jambahr/shared/mobile/leave";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import {
  calendarYearLabel,
  leaveApprovalsQueryKey,
  leaveErrorCopy,
  leaveQueryKey,
  useCancelLeave,
  useDecideLeave,
} from "@/lib/leave";
import { BalanceCard } from "@/components/leaves/balance-card";
import { LeaveRequestCard } from "@/components/leaves/leave-request-card";
import { ApprovalCard } from "@/components/leaves/approval-card";
import { RequestLeaveSheet } from "@/components/leaves/request-leave-sheet";

type Segment = "mine" | "approvals";
type Filter = "all" | "pending" | "approved" | "rejected";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

/**
 * The Leaves tab (hi-fi 2b + 2c). Employees see only "Mine" (balances +
 * requests + Request-leave sheet). Managers/admins additionally get the
 * "Approvals" segment (pending decisions in their scope). The segment control
 * itself is hidden entirely for employees — they never see an Approvals affordance.
 */
export function LeavesScreen() {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;
  const isManager = !!me && hasPermission(me.role, "manager");

  // Home's "N leave requests waiting on you" row deep-links here with
  // ?segment=approvals (2a Needs-attention row). Default to "mine" so a
  // plain tab visit never lands on Approvals. React to the param on every
  // CHANGE (not just the initial mount) so a warm/already-visited Leaves tab
  // also honors the deep-link — expo-router reuses the mounted screen, so a
  // useState initializer alone only fires on a cold mount. This follows
  // React's "adjusting state when a prop changes" pattern (set state during
  // render, guarded by comparing against the last-seen param, rather than in
  // a useEffect) — see react.dev/learn/you-might-not-need-an-effect. Only the
  // param TRANSITION drives the segment; the user is free to switch away
  // afterward without the link fighting them back.
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(
    params.segment === "approvals" ? "approvals" : "mine"
  );
  const [lastParamSegment, setLastParamSegment] = useState(params.segment);
  if (params.segment !== lastParamSegment) {
    setLastParamSegment(params.segment);
    if (params.segment === "approvals" && isManager) {
      setSegment("approvals");
    }
  }

  // Approvals payload is fetched for managers regardless of the active segment
  // so the segment's pending-count badge is accurate the moment the tab opens.
  const approvals = useMobileQuery<MobileLeaveApprovalsResponse>(
    leaveApprovalsQueryKey(orgId),
    "/api/mobile/leave/approvals",
    { orgId, staleTime: 30_000, enabled: !!orgId && isManager }
  );
  const pendingCount = approvals.data?.requests.length ?? 0;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      {/* Title + calendar-year footnote (balances aggregate Jan–Dec) */}
      <View className="flex-row items-baseline justify-between px-4 pb-2 pt-2">
        <Text className="text-[22px] font-bold text-ink-900">Leaves</Text>
        <Text className="text-[13px] text-ink-600">{calendarYearLabel()}</Text>
      </View>

      {/* Mine / Approvals segment — managers only */}
      {isManager ? (
        <View className="mx-4 mb-1 flex-row rounded-[10px] bg-[#EFF1F3] p-0.5">
          <SegmentButton
            label="Mine"
            active={segment === "mine"}
            onPress={() => setSegment("mine")}
          />
          <SegmentButton
            label="Approvals"
            count={pendingCount}
            active={segment === "approvals"}
            onPress={() => setSegment("approvals")}
          />
        </View>
      ) : null}

      {segment === "approvals" && isManager ? (
        <ApprovalsView orgId={orgId} query={approvals} />
      ) : (
        <MineView orgId={orgId} />
      )}
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  active,
  count,
  onPress,
}: {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center rounded-lg py-2 ${
        active ? "bg-surface" : ""
      }`}
    >
      <Text className={`text-[13px] font-semibold ${active ? "text-ink-900" : "text-ink-600"}`}>
        {label}
      </Text>
      {count && count > 0 ? (
        <Text className="ml-1 text-[13px] font-semibold text-danger">· {count}</Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------- Mine ------------------------------------ */

/** Groups a policy list into rows of three for the 3-across balance grid. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function MineView({ orgId }: { orgId: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const leave = useMobileQuery<MobileLeaveResponse>(
    leaveQueryKey(orgId),
    "/api/mobile/leave",
    { orgId, staleTime: 60_000, enabled: !!orgId }
  );
  const cancel = useCancelLeave(orgId);

  const data = leave.data;
  const balances = data?.balances ?? [];
  const requests = data?.myRequests ?? [];

  const filtered =
    filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const today = istToday();
  const isUpcoming = (r: MobileLeaveRequestItem) =>
    r.status === "pending" || r.startDate >= today;
  const upcoming = filtered
    .filter(isUpcoming)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const earlier = filtered
    .filter((r) => !isUpcoming(r))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const onCancel = (id: string) => {
    setActionError(null);
    setCancellingId(id);
    cancel.mutate(id, {
      onError: (error) => setActionError(leaveErrorCopy(error)),
      onSettled: () => setCancellingId(null),
    });
  };

  // The very first load has no data yet — the skeleton is a fixed stack of
  // placeholder boxes (not the data-driven request list), so it stays a
  // plain ScrollView per the FlashList sweep rule.
  if (!data && leave.isLoading) {
    return (
      <>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-10 pt-1"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={leave.isRefetching} onRefresh={() => leave.refetch()} />
          }
        >
          <MineSkeleton />
        </ScrollView>
        <RequestLeaveSheet
          visible={sheetOpen}
          balances={balances}
          orgId={orgId}
          onClose={() => setSheetOpen(false)}
        />
      </>
    );
  }

  // The requests list (grouped into UPCOMING / EARLIER) is the genuinely
  // unbounded part of this screen — everything above it (balances, CTA,
  // error banner, filter pills) is fixed-size chrome and becomes the
  // FlashList's ListHeaderComponent so FlashList owns the one scroll.
  const rows: MineRow[] = [];
  if (upcoming.length > 0) {
    rows.push({ type: "section", key: "section-upcoming", title: "UPCOMING" });
    for (const r of upcoming) rows.push({ type: "request", key: r.id, request: r });
  }
  if (earlier.length > 0) {
    rows.push({ type: "section", key: "section-earlier", title: "EARLIER" });
    for (const r of earlier) rows.push({ type: "request", key: r.id, request: r });
  }

  return (
    <>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        showsVerticalScrollIndicator={false}
        refreshing={leave.isRefetching}
        onRefresh={() => leave.refetch()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 16 }}>
            {/* Balances */}
            {balances.length > 0 ? (
              <View className="gap-2">
                {chunk(balances, 3).map((row, ri) => (
                  <View key={`brow-${ri}`} className="flex-row gap-2">
                    {row.map((b) => (
                      <BalanceCard key={b.policyId} balance={b} />
                    ))}
                    {/* Pad short rows so cards keep equal width. */}
                    {Array.from({ length: 3 - row.length }).map((_, i) => (
                      <View key={`pad-${i}`} className="flex-1" />
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            {/* Primary CTA */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setSheetOpen(true)}
              className="h-[50px] flex-row items-center justify-center rounded-[14px] bg-brand active:bg-brand-pressed"
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text className="ml-1 text-[17px] font-semibold text-white">Request leave</Text>
            </Pressable>

            {actionError ? (
              <View className="flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
                <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{actionError}</Text>
              </View>
            ) : null}

            {/* Filter pills */}
            <View className="flex-row flex-wrap gap-2">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFilter(f.key)}
                    className={`rounded-full px-3.5 py-1.5 ${
                      active ? "bg-brand" : "border border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${active ? "text-white" : "text-ink-600"}`}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyRequests filter={filter} />}
        renderItem={({ item }: { item: MineRow }) =>
          item.type === "section" ? (
            <Text className="pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {item.title}
            </Text>
          ) : (
            <View className="pb-3">
              <LeaveRequestCard
                request={item.request}
                onCancel={onCancel}
                cancelling={cancellingId === item.request.id}
              />
            </View>
          )
        }
      />

      <RequestLeaveSheet
        visible={sheetOpen}
        balances={balances}
        orgId={orgId}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

type MineRow =
  | { type: "section"; key: string; title: string }
  | { type: "request"; key: string; request: MobileLeaveRequestItem };

function EmptyRequests({ filter }: { filter: Filter }) {
  return (
    <View className="items-center rounded-2xl border border-line bg-surface px-6 py-10">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
        <Ionicons name="calendar-outline" size={24} color="#17806D" />
      </View>
      <Text className="mt-3 text-[15px] font-semibold text-ink-900">
        {filter === "all" ? "No leave requests yet" : `No ${filter} requests`}
      </Text>
      <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
        {filter === "all"
          ? "Tap Request leave to apply for time off. Your requests and their status show up here."
          : "Try a different filter to see your other requests."}
      </Text>
    </View>
  );
}

function MineSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row gap-2">
        <View className="h-24 flex-1 rounded-2xl bg-[#EFF1F3]" />
        <View className="h-24 flex-1 rounded-2xl bg-[#EFF1F3]" />
        <View className="h-24 flex-1 rounded-2xl bg-[#EFF1F3]" />
      </View>
      <View className="h-[50px] rounded-[14px] bg-[#EFF1F3]" />
      <View className="h-28 rounded-2xl bg-[#EFF1F3]" />
      <View className="h-28 rounded-2xl bg-[#EFF1F3]" />
    </View>
  );
}

/* ----------------------------- Approvals --------------------------------- */

function ApprovalsView({
  orgId,
  query,
}: {
  orgId: string | null;
  query: ReturnType<typeof useMobileQuery<MobileLeaveApprovalsResponse>>;
}) {
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const decide = useDecideLeave(orgId);

  const data = query.data;
  const requests = data?.requests ?? [];

  const runDecide = (requestId: string, decision: "approve" | "reject", comment?: string) => {
    setActionError(null);
    setDecidingId(requestId);
    decide.mutate(
      { requestId, decision, comment },
      {
        onError: (error) => setActionError(leaveErrorCopy(error)),
        onSettled: () => setDecidingId(null),
      }
    );
  };

  // First-load skeleton is fixed-size chrome, not the data-driven list —
  // stays a plain ScrollView per the FlashList sweep rule.
  if (!data && query.isLoading) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
        }
      >
        <View className="gap-4">
          <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
          <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
        </View>
      </ScrollView>
    );
  }

  return (
    <FlashList
      data={requests}
      keyExtractor={(item) => item.requestId}
      showsVerticalScrollIndicator={false}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 16 }}>
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Pending your decision
          </Text>

          {actionError ? (
            <View className="flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
              <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{actionError}</Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View className="items-center rounded-2xl border border-line bg-surface px-6 py-10">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-success-tint">
            <Ionicons name="checkmark-done-outline" size={24} color="#177245" />
          </View>
          <Text className="mt-3 text-[15px] font-semibold text-ink-900">All caught up</Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
            No leave requests are waiting on your decision right now.
          </Text>
        </View>
      }
      ListFooterComponent={
        // Decision history — count only in v1 (full history list deferred).
        data && data.historyCount > 0 ? (
          <Text className="px-1 pt-4 text-[13px] text-ink-400">
            Decision history ({data.historyCount})
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View className="pb-4">
          <ApprovalCard
            item={item}
            busy={decidingId === item.requestId}
            onApprove={(id) => runDecide(id, "approve")}
            onReject={(id, comment) => runDecide(id, "reject", comment)}
          />
        </View>
      )}
    />
  );
}
