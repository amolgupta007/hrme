import { Pressable, Text, View } from "react-native";
import type { MonthDay } from "@jambahr/shared/attendance/month-calendar";
import { STATE_META } from "@/components/attendance/state-legend";

/**
 * Weeks start Monday — the Indian HR convention (the working week is Mon–Sat
 * with Sunday the common week-off). Keep this consistent with the weekday
 * header order below.
 */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Monday-based weekday index (0 = Mon … 6 = Sun) for a `YYYY-MM-DD` string,
 * parsed as a plain calendar date (UTC, no timezone shift) so the grid
 * alignment is stable regardless of the device timezone.
 */
function mondayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0 Sun..6 Sat
  return (jsDay + 6) % 7;
}

function dayNumber(dateStr: string): string {
  return String(Number(dateStr.split("-")[2]));
}

/**
 * The month calendar grid. Renders `days` (already computed server-side by
 * `computeMonthCalendar`) as 7-column Monday-start weeks with state colours on
 * their tints; today is ringed 1.5pt brand/primary. Future days are inert
 * (design: plain, and not tappable — nothing to show yet); every other day
 * opens the detail sheet via `onDayPress`.
 */
export function MonthGrid({
  days,
  onDayPress,
  pendingDates,
}: {
  days: MonthDay[];
  onDayPress: (day: MonthDay) => void;
  /** IST dates carrying a pending regularization — rendered as an amber dot. */
  pendingDates?: string[];
}) {
  const leadingBlanks = days.length > 0 ? mondayIndex(days[0].date) : 0;
  const pending = new Set(pendingDates ?? []);

  return (
    <View>
      {/* Weekday header */}
      <View className="mb-1 flex-row">
        {WEEKDAYS.map((w) => (
          <View key={w} className="flex-1 items-center py-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {w}
            </Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View className="flex-row flex-wrap">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} className="w-[14.28%] p-0.5" />
        ))}

        {days.map((day) => {
          const meta = STATE_META[day.state];
          const isFuture = day.state === "future";
          return (
            <View key={day.date} className="w-[14.28%] p-0.5">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isFuture }}
                disabled={isFuture}
                onPress={() => onDayPress(day)}
                className={`h-11 items-center justify-center rounded-xl ${meta.cellBg} ${
                  day.isToday ? "border-[1.5px] border-brand" : ""
                } ${isFuture ? "" : "active:opacity-70"}`}
              >
                <Text
                  className={`text-[15px] ${day.isToday ? "font-bold" : "font-medium"} ${meta.cellText}`}
                >
                  {dayNumber(day.date)}
                </Text>
                {pending.has(day.date) ? (
                  <View className="absolute bottom-1 h-1 w-1 rounded-full bg-warning" />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
