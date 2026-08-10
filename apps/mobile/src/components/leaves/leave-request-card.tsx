import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileLeaveRequestItem } from "@jambahr/shared/mobile/leave";
import { dateRangeLabel, daysLabel, decidedAtLabel } from "@/lib/leave";

/** Status → chip styling. Approved is the one solid pill (design usage rule 2). */
function statusChip(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case "approved":
      return { label: "Approved", bg: "bg-success", fg: "text-white" };
    case "rejected":
      return { label: "Rejected", bg: "bg-danger-tint", fg: "text-danger-ontint" };
    case "cancelled":
      return { label: "Cancelled", bg: "bg-[#EFF1F3]", fg: "text-ink-600" };
    default:
      return { label: "Pending", bg: "bg-warning-tint", fg: "text-warning-ontint" };
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * One row in the staff member's own leave history (hi-fi 2b). Range title +
 * `{type · Nd · reason}` sub + status chip; when the request has been decided
 * an inset divider reveals the approver-attribution row (mini avatar +
 * "Approved by {name} · {date}"). Pending own requests get a Cancel affordance.
 */
export function LeaveRequestCard({
  request,
  onCancel,
  cancelling = false,
}: {
  request: MobileLeaveRequestItem;
  onCancel?: (id: string) => void;
  cancelling?: boolean;
}) {
  const chip = statusChip(request.status);
  const isPending = request.status === "pending";
  const decided = !!request.decidedAt && (request.status === "approved" || request.status === "rejected");
  const verb = request.status === "approved" ? "Approved" : "Rejected";

  const subParts = [
    request.type.charAt(0).toUpperCase() + request.type.slice(1),
    daysLabel(request.days),
  ];
  if (request.reason) subParts.push(request.reason);

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[16px] font-semibold text-ink-900">
            {dateRangeLabel(request.startDate, request.endDate)}
          </Text>
          <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={2}>
            {subParts.join(" · ")}
          </Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${chip.bg}`}>
          <Text className={`text-[13px] font-medium ${chip.fg}`}>{chip.label}</Text>
        </View>
      </View>

      {decided ? (
        <View className="mt-3 flex-row items-center border-t border-line pt-3">
          {request.approverName ? (
            <View className="mr-2 h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-tint">
              <Text className="text-[10px] font-bold text-brand-pressed">
                {initials(request.approverName)}
              </Text>
            </View>
          ) : null}
          <Text className="flex-1 text-[12px] text-ink-400">
            {request.approverName
              ? `${verb} by ${request.approverName} · ${decidedAtLabel(request.decidedAt!)}`
              : `${verb} · ${decidedAtLabel(request.decidedAt!)}`}
          </Text>
        </View>
      ) : null}

      {isPending && onCancel ? (
        <Pressable
          accessibilityRole="button"
          disabled={cancelling}
          onPress={() => onCancel(request.id)}
          className="mt-3 h-9 flex-row items-center justify-center rounded-xl border border-line bg-surface active:bg-danger-tint"
        >
          <Ionicons name="close-circle-outline" size={15} color="#B91C1C" />
          <Text className="ml-1.5 text-[13px] font-medium text-danger-ontint">
            {cancelling ? "Cancelling…" : "Cancel request"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
