import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

type Row = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconFg: string;
  title: string;
  subtitle?: string;
  /** Right-side accent: a chevron (navigable), a chip (overdue), or a solid count badge (own items). */
  trailing:
    | { kind: "chevron" }
    | { kind: "chip"; label: string; bg: string; fg: string }
    | { kind: "count"; value: number };
  onPress?: () => void;
};

/**
 * "Needs attention · N items" (2a design). Redefines the D1 "pending" card's
 * scope: action-required items first — manager leave-approvals + overdue
 * trainings — then D1's own-submitted pending items (leave requests /
 * regularizations awaiting someone else's decision) so that information
 * isn't lost, just reordered beneath the higher-priority rows. Renders only
 * non-empty rows; an all-clear state replaces the card body when nothing is
 * pending anywhere.
 */
export function PendingCard({
  pendingApprovals,
  trainingsOverdue,
  leaveRequests,
  regularizations,
  onApprovalsPress,
}: {
  /** Leave requests waiting on the caller's decision. `null` = not a manager (row hidden). */
  pendingApprovals: number | null;
  /** The caller's own overdue training enrollments. */
  trainingsOverdue: number;
  /** The caller's own leave requests still pending someone else's decision. */
  leaveRequests: number;
  /** The caller's own regularization requests still pending admin review. */
  regularizations: number;
  onApprovalsPress?: () => void;
}) {
  const rows: Row[] = [];

  if (pendingApprovals !== null && pendingApprovals > 0) {
    rows.push({
      key: "approvals",
      icon: "reader-outline",
      iconBg: "bg-warning-tint",
      iconFg: "#8A5A06",
      title: `${pendingApprovals} leave ${pendingApprovals === 1 ? "request" : "requests"} waiting on you`,
      subtitle: "Tap to review",
      trailing: { kind: "chevron" },
      onPress: onApprovalsPress,
    });
  }
  if (trainingsOverdue > 0) {
    rows.push({
      key: "training",
      icon: "alert-circle-outline",
      iconBg: "bg-danger-tint",
      iconFg: "#B91C1C",
      title: `${trainingsOverdue} ${trainingsOverdue === 1 ? "training" : "trainings"} overdue`,
      trailing: { kind: "chip", label: "Overdue", bg: "bg-danger-tint", fg: "text-danger-ontint" },
    });
  }
  if (leaveRequests > 0) {
    rows.push({
      key: "own-leave",
      icon: "calendar-outline",
      iconBg: "bg-[#EFF1F3]",
      iconFg: "#5B6472",
      title: "Your leave requests pending",
      trailing: { kind: "count", value: leaveRequests },
    });
  }
  if (regularizations > 0) {
    rows.push({
      key: "own-regularizations",
      icon: "time-outline",
      iconBg: "bg-[#EFF1F3]",
      iconFg: "#5B6472",
      title: "Your regularizations pending",
      trailing: { kind: "count", value: regularizations },
    });
  }

  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[17px] font-bold text-ink-900">Needs attention</Text>
        {rows.length > 0 ? (
          <Text className="text-[13px] font-medium text-ink-600">
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </Text>
        ) : null}
      </View>

      <View className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.length === 0 ? (
          <View className="flex-row items-center p-4">
            <Ionicons name="checkmark-circle-outline" size={20} color="#1E9E63" />
            <Text className="ml-2 text-[15px] text-ink-600">You&apos;re all caught up.</Text>
          </View>
        ) : (
          rows.map((row, i) => <NeedsAttentionRow key={row.key} row={row} withDivider={i > 0} />)
        )}
      </View>
    </View>
  );
}

function NeedsAttentionRow({ row, withDivider }: { row: Row; withDivider: boolean }) {
  const Wrapper = row.onPress ? Pressable : View;
  return (
    <>
      {withDivider ? <View className="ml-16 h-px bg-line" /> : null}
      <Wrapper
        {...(row.onPress
          ? { accessibilityRole: "button" as const, onPress: row.onPress }
          : {})}
        className="flex-row items-center gap-3 px-4 py-3 active:bg-brand-tint"
      >
        <View className={`h-9 w-9 items-center justify-center rounded-[10px] ${row.iconBg}`}>
          <Ionicons name={row.icon} size={18} color={row.iconFg} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink-900" numberOfLines={1}>
            {row.title}
          </Text>
          {row.subtitle ? (
            <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={1}>
              {row.subtitle}
            </Text>
          ) : null}
        </View>
        {row.trailing.kind === "chevron" ? (
          <Ionicons name="chevron-forward" size={18} color="#6A727E" />
        ) : row.trailing.kind === "chip" ? (
          <View className={`rounded-full px-2.5 py-1 ${row.trailing.bg}`}>
            <Text className={`text-[12px] font-medium ${row.trailing.fg}`}>
              {row.trailing.label}
            </Text>
          </View>
        ) : (
          <View className="h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5">
            <Text className="text-[12px] font-bold text-white">{row.trailing.value}</Text>
          </View>
        )}
      </Wrapper>
    </>
  );
}
