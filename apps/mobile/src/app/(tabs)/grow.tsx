import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

/**
 * Grow tab — polished "coming soon" screen (Task 7). Objectives, reviews and
 * training land in a later D slice; this applies the design language rather
 * than the generic PlaceholderScreen so the tab reads as intentional, not empty.
 */
export default function Grow() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-2 gap-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="pt-2 text-[22px] font-bold text-ink-900">Grow</Text>

        {/* Hero */}
        <View className="items-center rounded-2xl border border-line bg-surface px-6 py-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
            <Ionicons name="trending-up-outline" size={28} color="#17806D" />
          </View>
          <Text className="mt-4 text-center text-[17px] font-bold text-ink-900">
            Your growth, in one place
          </Text>
          <Text className="mt-1.5 max-w-[300px] text-center text-[13px] leading-5 text-ink-600">
            Objectives, performance reviews and training are coming to mobile in an
            upcoming release.
          </Text>
        </View>

        {/* Preview list of what's coming */}
        <View className="rounded-2xl border border-line bg-surface">
          <ComingRow
            icon="flag-outline"
            title="Objectives"
            blurb="Track your goals and check in on progress."
          />
          <ComingRow
            icon="star-outline"
            title="Reviews"
            blurb="Self-reviews and manager feedback each cycle."
          />
          <ComingRow
            icon="school-outline"
            title="Training"
            blurb="Assigned courses and completion status."
            isLast
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ComingRow({
  icon,
  title,
  blurb,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  blurb: string;
  isLast?: boolean;
}) {
  return (
    <View className={`flex-row items-center px-4 py-3.5 ${isLast ? "" : "border-b border-line"}`}>
      <View className="h-9 w-9 items-center justify-center rounded-full bg-[#EFF1F3]">
        <Ionicons name={icon} size={17} color="#3F4757" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-ink-900">{title}</Text>
        <Text className="mt-0.5 text-[12px] text-ink-600">{blurb}</Text>
      </View>
      <View className="rounded-full bg-brand-tint px-2 py-0.5">
        <Text className="text-[11px] font-semibold text-brand-pressed">Soon</Text>
      </View>
    </View>
  );
}
