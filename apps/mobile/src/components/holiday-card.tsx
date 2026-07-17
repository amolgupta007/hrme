import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileHolidayLite } from "@jambahr/shared/mobile/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08-15" → { day: "15", month: "Aug", weekday: "Sat" } (parsed as a
 * plain calendar date, no timezone shift). */
function parts(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const weekday = dt.toLocaleDateString([], { weekday: "short" });
  return { day: String(d ?? ""), month: MONTHS[(m ?? 1) - 1] ?? "", weekday };
}

function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** Next upcoming holiday (design: info-tint accented date tile + list row). */
export function HolidayCard({ holiday }: { holiday: MobileHolidayLite }) {
  const { day, month, weekday } = parts(holiday.date);
  const dleft = daysUntil(holiday.date);
  const when =
    dleft <= 0 ? "Today" : dleft === 1 ? "Tomorrow" : `in ${dleft} days`;

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <Text className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
        Next holiday
      </Text>
      <View className="flex-row items-center">
        <View className="mr-3 h-12 w-12 items-center justify-center rounded-xl bg-info-tint">
          <Text className="text-[15px] font-extrabold leading-4 text-info-ontint">{day}</Text>
          <Text className="mt-0.5 text-[10px] font-semibold uppercase text-info-ontint">
            {month}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[17px] font-semibold text-ink-900" numberOfLines={1}>
            {holiday.name}
          </Text>
          <Text className="mt-0.5 text-[13px] text-ink-600">
            {weekday} · {when}
          </Text>
        </View>
        {holiday.is_optional ? (
          <View className="rounded-full bg-[#EFF1F3] px-2.5 py-1">
            <Text className="text-[11px] font-medium text-ink-600">Optional</Text>
          </View>
        ) : (
          <Ionicons name="sunny-outline" size={20} color="#9AA1AB" />
        )}
      </View>
    </View>
  );
}
