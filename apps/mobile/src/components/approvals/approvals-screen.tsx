import { useState } from "react";
import { Alert, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlashList } from "@shopify/flash-list";
import type { MobileApprovalItem } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { approvalErrorCopy, useApprovals, useDecide } from "@/lib/approvals";
import { confirmBiometric } from "@/lib/biometric";
import { ApprovalCard } from "@/components/approvals/approval-card";

/** Stable key across the 4 merged types — ids aren't guaranteed unique cross-table. */
function itemKey(item: Pick<MobileApprovalItem, "type" | "id">): string {
  return `${item.type}:${item.id}`;
}

/**
 * The unified Owner/Admin Approvals inbox (Mobile D4, Task 11) — one merged
 * newest-first feed of pending leave / regularization / OT / payroll
 * decisions. Reached from the admin-Home "Pending approvals" card and the
 * `approval_pending` push deep-link. The BFF already scopes by role (manager
 * dept-scope / admin org-wide / employee sees nothing), so this screen has
 * no separate role gate — an employee who somehow lands here just sees the
 * empty state.
 */
export function ApprovalsScreen() {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  const query = useApprovals(orgId);
  const decide = useDecide(orgId);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  // Optimistic removal: hide a decided item immediately rather than waiting
  // for the invalidated query to refetch. Reset whenever a fresh payload
  // actually lands (the decided item is gone from `query.data` for real by
  // then, and this keeps the set from growing unbounded across a session).
  // Done as a render-time state adjustment (compare-and-set against the last
  // seen `dataUpdatedAt`, mirroring `leaves-screen.tsx`'s segment-param
  // pattern) rather than a `useEffect` + `setState`, which the lint rule
  // `react-hooks/set-state-in-effect` flags as a cascading-render risk.
  const [justResolved, setJustResolved] = useState<Set<string>>(new Set());
  const [lastDataUpdatedAt, setLastDataUpdatedAt] = useState(query.dataUpdatedAt);
  if (query.dataUpdatedAt !== lastDataUpdatedAt) {
    setLastDataUpdatedAt(query.dataUpdatedAt);
    if (justResolved.size > 0) setJustResolved(new Set());
  }

  const allItems = query.data?.items ?? [];
  const items = allItems.filter((item) => !justResolved.has(itemKey(item)));
  const leaveIds = items.filter((item) => item.type === "leave").map((item) => item.id);

  const runDecide = (item: MobileApprovalItem, action: "approve" | "reject", comment?: string) => {
    setErrorMessage(null);
    const key = itemKey(item);
    setBusyKey(key);
    decide.mutate(
      { type: item.type, id: item.id, action, comment },
      {
        onSuccess: () => setJustResolved((prev) => new Set(prev).add(key)),
        onError: (error) => setErrorMessage(approvalErrorCopy(error)),
        onSettled: () => setBusyKey((k) => (k === key ? null : k)),
      }
    );
  };

  const onApprove = (item: MobileApprovalItem) => {
    if (item.type === "payroll") {
      void (async () => {
        const ok = await confirmBiometric();
        if (!ok) {
          Alert.alert(
            "Biometric confirmation needed",
            "Payroll approval needs a biometric check on this device. Approve it on the web app instead."
          );
          return;
        }
        runDecide(item, "approve");
      })();
      return;
    }
    runDecide(item, "approve");
  };

  const onReject = (item: MobileApprovalItem, comment: string) => {
    runDecide(item, "reject", comment);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const runBatchApprove = async () => {
    if (selectedIds.size === 0 || batchBusy) return;
    setErrorMessage(null);
    setBatchBusy(true);
    const ids = Array.from(selectedIds);
    let failureCount = 0;
    for (const id of ids) {
      try {
        await decide.mutateAsync({ type: "leave", id, action: "approve" });
        setJustResolved((prev) => new Set(prev).add(itemKey({ type: "leave", id })));
      } catch {
        failureCount += 1;
      }
    }
    setBatchBusy(false);
    setSelectedIds(new Set());
    if (failureCount > 0) {
      setErrorMessage(
        failureCount === ids.length
          ? "Couldn't approve the selected requests. Try them individually."
          : `${failureCount} of ${ids.length} selected requests couldn't be approved. Try those individually.`
      );
    } else {
      setSelectionMode(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      {!query.data && query.isLoading ? (
        <View className="gap-3 px-4 pt-3">
          <View className="h-[150px] rounded-2xl bg-[#EFF1F3]" />
          <View className="h-[150px] rounded-2xl bg-[#EFF1F3]" />
          <View className="h-[150px] rounded-2xl bg-[#EFF1F3]" />
        </View>
      ) : query.isError && !query.data ? (
        <View className="mx-4 mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-8">
          <Text className="text-[15px] font-semibold text-ink-900">
            Couldn&apos;t load approvals
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
          <View className="h-12 w-12 items-center justify-center rounded-full bg-success-tint">
            <Ionicons name="checkmark-done-outline" size={24} color="#177245" />
          </View>
          <Text className="mt-3 text-[15px] font-semibold text-ink-900">You&apos;re all caught up</Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
            No leave, regularization, overtime, or payroll decisions are waiting on you right now.
          </Text>
        </View>
      ) : (
        // Flash-list v2 auto-sizes cells (no `estimatedItemSize` prop).
        <FlashList
          data={items}
          keyExtractor={(item) => itemKey(item)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
          }
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  Pending your decision · {items.length}
                </Text>
                {leaveIds.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={toggleSelectionMode}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 active:bg-brand-tint"
                  >
                    <Text className="text-[12px] font-semibold text-brand-pressed">
                      {selectionMode ? "Cancel" : "Select leave"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {errorMessage ? (
                <View className="flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
                  <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                  <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{errorMessage}</Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const key = itemKey(item);
            return (
              <View className="pb-3">
                <ApprovalCard
                  item={item}
                  busy={busyKey === key}
                  onApprove={onApprove}
                  onReject={onReject}
                  selectable={selectionMode && item.type === "leave"}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={toggleSelect}
                />
              </View>
            );
          }}
        />
      )}

      {/* Batch-approve bar — only while selecting leave items */}
      {selectionMode && selectedIds.size > 0 ? (
        <View className="border-t border-line bg-surface px-4 py-3">
          <Pressable
            accessibilityRole="button"
            disabled={batchBusy}
            onPress={() => void runBatchApprove()}
            className="h-12 items-center justify-center rounded-xl bg-brand active:bg-brand-pressed"
          >
            <Text className="text-[15px] font-semibold text-white">
              {batchBusy
                ? "Approving…"
                : `Approve ${selectedIds.size} selected leave request${selectedIds.size === 1 ? "" : "s"}`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
