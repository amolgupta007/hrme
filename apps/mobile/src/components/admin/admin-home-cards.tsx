import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import type { MobileHomeResponse } from "@jambahr/shared/mobile/types";

type AdminHome = NonNullable<MobileHomeResponse["adminHome"]>;

const PAYROLL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  processing: "Processing",
  awaiting_approval: "Awaiting approval",
};

/** Payroll statuses worth surfacing on Home — `none`/`paid` are quiet by design. */
const MID_CYCLE_PAYROLL_STATUSES = new Set(["draft", "processing", "awaiting_approval"]);

function formatApprovalsBreakdown(byType: AdminHome["pendingApprovals"]["byType"]): string {
  const parts: string[] = [];
  if (byType.leave > 0) parts.push(`${byType.leave} leave`);
  if (byType.regularization > 0) parts.push(`${byType.regularization} regularization`);
  if (byType.ot > 0) parts.push(`${byType.ot} OT`);
  if (byType.payroll > 0) parts.push(`${byType.payroll} payroll`);
  return parts.join(" · ");
}

/**
 * Org situational-awareness block for managers/admins (Mobile D4 Task 10).
 * Rendered ABOVE the personal cards on Home, only when the BFF included
 * `adminHome` in the payload (manager+ — see `MobileHomeResponse.adminHome`
 * doc-comment). Three pieces: today's attendance mix, a prominent
 * pending-approvals entry point, and the current payroll cycle's status
 * (mid-cycle states only).
 */
export function AdminHomeCards({ data }: { data: AdminHome }) {
  const router = useRouter();
  const totalApprovals = data.pendingApprovals.total;
  const breakdown = formatApprovalsBreakdown(data.pendingApprovals.byType);
  const showPayroll = !!data.payroll && MID_CYCLE_PAYROLL_STATUSES.has(data.payroll.status);

  return (
    <View className="gap-2">
      <Text className="text-[17px] font-bold text-ink-900">Your organization</Text>

      <View className="flex-row gap-2">
        <AdminStatTile label="present today" value={data.today.present} color="#177245" />
        <AdminStatTile label="absent today" value={data.today.absent} color="#B91C1C" />
        <AdminStatTile label="late today" value={data.today.late} color="#8A5A06" />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pending approvals, ${totalApprovals}`}
        onPress={() => router.push("/approvals")}
        className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4 active:bg-brand-tint"
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${
            totalApprovals > 0 ? "bg-warning-tint" : "bg-success-tint"
          }`}
        >
          <Ionicons
            name={totalApprovals > 0 ? "checkmark-done-outline" : "checkmark-circle-outline"}
            size={20}
            color={totalApprovals > 0 ? "#8A5A06" : "#177245"}
          />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink-900">
            Pending approvals ({totalApprovals})
          </Text>
          <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={1}>
            {totalApprovals > 0 ? breakdown : "You're all caught up"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9AA1AB" />
      </Pressable>

      {showPayroll && data.payroll ? (
        <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-info-tint">
            <Ionicons name="cash-outline" size={20} color="#2A4BB5" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-ink-900" numberOfLines={1}>
              Payroll{data.payroll.month ? ` · ${data.payroll.month}` : ""}
            </Text>
            <Text className="mt-0.5 text-[13px] text-ink-600">
              {PAYROLL_STATUS_LABEL[data.payroll.status] ?? data.payroll.status}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AdminStatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface p-3">
      <Text
        className="text-[24px] font-extrabold leading-7 text-ink-900"
        style={{ color }}
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
