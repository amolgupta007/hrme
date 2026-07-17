import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
};

/**
 * "Needs attention" pending statuses (design: list rows + solid-danger count
 * badges). Renders only non-zero rows; when nothing is pending it collapses to
 * a quiet all-clear state rather than an empty card.
 */
export function PendingCard({
  leaveRequests,
  regularizations,
}: {
  leaveRequests: number;
  regularizations: number;
}) {
  const allRows: Row[] = [
    { icon: "calendar-outline", label: "Leave requests", count: leaveRequests },
    { icon: "time-outline", label: "Regularizations", count: regularizations },
  ];
  const rows = allRows.filter((r) => r.count > 0);

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <Text className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
        Needs attention
      </Text>
      {rows.length === 0 ? (
        <View className="flex-row items-center">
          <Ionicons name="checkmark-circle-outline" size={20} color="#1E9E63" />
          <Text className="ml-2 text-[15px] text-ink-600">You&apos;re all caught up.</Text>
        </View>
      ) : (
        rows.map((row, i) => (
          <View
            key={row.label}
            className={`flex-row items-center py-2.5 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <Ionicons name={row.icon} size={18} color="#5B6472" />
            <Text className="ml-3 flex-1 text-[17px] text-ink-900">{row.label}</Text>
            <View className="h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5">
              <Text className="text-[12px] font-bold text-white">{row.count}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
