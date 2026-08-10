import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

/**
 * Quick actions (design §usage rule 1: ONE primary CTA per screen). The
 * state-aware Punch in/out is the single primary (50pt, radius 14, brand);
 * Apply leave + Payslips are D1 stubs rendered as tertiary buttons (44pt,
 * radius 12, 1pt border, white bg).
 */
export function QuickActions({
  isClockedIn,
  isPunching,
  onPunch,
  onApplyLeave,
  onPayslips,
}: {
  isClockedIn: boolean;
  isPunching: boolean;
  onPunch: () => void;
  onApplyLeave: () => void;
  onPayslips: () => void;
}) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={isPunching}
        onPress={onPunch}
        className={`h-[50px] flex-row items-center justify-center rounded-[14px] active:bg-brand-pressed ${
          isPunching ? "bg-brand/70" : "bg-brand"
        }`}
      >
        {isPunching ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons
              name={isClockedIn ? "log-out-outline" : "log-in-outline"}
              size={18}
              color="#FFFFFF"
            />
            <Text className="ml-2 text-[17px] font-semibold text-white">
              {isClockedIn ? "Punch out" : "Punch in"}
            </Text>
          </>
        )}
      </Pressable>

      <View className="mt-3 flex-row gap-3">
        <TertiaryButton icon="calendar-outline" label="Apply leave" onPress={onApplyLeave} />
        <TertiaryButton icon="cash-outline" label="Payslips" onPress={onPayslips} />
      </View>
    </View>
  );
}

function TertiaryButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-11 flex-1 flex-row items-center justify-center rounded-xl border border-line bg-surface active:bg-brand-tint"
    >
      <Ionicons name={icon} size={16} color="#5B6472" />
      <Text className="ml-1.5 text-[15px] font-medium text-ink-900">{label}</Text>
    </Pressable>
  );
}
