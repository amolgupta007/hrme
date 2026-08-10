import { Pressable, Text, View } from "react-native";

/**
 * 2a hi-fi CTAs (design §usage rule 1: ONE primary CTA per screen). "＋
 * Request leave" is the single primary (44pt, radius 12, brand fill);
 * "View payslip" is the secondary/tint variant (same size, brand-tint bg,
 * brand-pressed text). Punch In/Out is no longer here — it moved inside
 * TodayCard (Slice 2 Task 6b) since the design has no room for a second
 * primary CTA on this screen.
 */
export function QuickActions({
  onRequestLeave,
  onViewPayslip,
}: {
  onRequestLeave: () => void;
  onViewPayslip: () => void;
}) {
  return (
    <View className="flex-row gap-2">
      <Pressable
        accessibilityRole="button"
        onPress={onRequestLeave}
        className="h-11 flex-1 flex-row items-center justify-center rounded-xl bg-brand active:bg-brand-pressed"
      >
        <Text className="text-[15px] font-semibold text-white">＋ Request leave</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onViewPayslip}
        className="h-11 flex-1 flex-row items-center justify-center rounded-xl bg-brand-tint active:bg-brand-pressed/10"
      >
        <Text className="text-[15px] font-semibold text-brand-pressed">View payslip</Text>
      </Pressable>
    </View>
  );
}
