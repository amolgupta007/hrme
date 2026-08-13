import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { istToday } from "@jambahr/shared/attendance/ist";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `Date.UTC`-based `YYYY-MM-DD` for a year/month(0-idx)/day. */
function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Monday-based index (0 = Mon … 6 = Sun) for a Y/M(0-idx)/1. */
function firstMondayOffset(year: number, month: number): number {
  const jsDay = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 Sun..6 Sat
  return (jsDay + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Dependency-free inline month calendar for picking a leave date RANGE. Tap
 * once to set the start, again to set the end (a second tap before the start
 * restarts the range). Days before today (IST) are inert — mobile self-apply is
 * for today/future. Endpoints render as solid brand, in-between days on brand
 * tint. Mirrors the attendance MonthGrid's Monday-start visual language without
 * needing server-computed day states.
 */
export function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const today = istToday();
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)) - 1);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const onPressDay = (date: string) => {
    // No start yet, or a complete range exists → begin a fresh range.
    if (!start || (start && end)) {
      onChange(date, null);
      return;
    }
    // Start set, no end → a tap before the start restarts; otherwise closes it.
    if (date < start) {
      onChange(date, null);
    } else {
      onChange(start, date);
    }
  };

  const leading = firstMondayOffset(viewYear, viewMonth);
  const count = daysInMonth(viewYear, viewMonth);

  return (
    <View>
      {/* Month header */}
      <View className="mb-1 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={goPrev}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-brand-tint"
        >
          <Ionicons name="chevron-back" size={20} color="#3F4757" />
        </Pressable>
        <Text className="text-[15px] font-semibold text-ink-900">
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={goNext}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-brand-tint"
        >
          <Ionicons name="chevron-forward" size={20} color="#3F4757" />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View className="flex-row">
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
        {Array.from({ length: leading }).map((_, i) => (
          <View key={`blank-${i}`} className="w-[14.28%] p-0.5" />
        ))}
        {Array.from({ length: count }).map((_, i) => {
          const day = i + 1;
          const date = iso(viewYear, viewMonth, day);
          const isPast = date < today;
          const isToday = date === today;
          const isStart = date === start;
          const isEnd = date === end;
          const inRange = !!start && !!end && date > start && date < end;
          const selected = isStart || isEnd;

          const cellBg = selected
            ? "bg-brand"
            : inRange
              ? "bg-brand-tint"
              : "";
          const textColor = selected
            ? "text-white"
            : isPast
              ? "text-ink-400"
              : "text-ink-900";

          return (
            <View key={date} className="w-[14.28%] p-0.5">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isPast, selected }}
                disabled={isPast}
                onPress={() => onPressDay(date)}
                className={`h-10 items-center justify-center rounded-xl ${cellBg} ${
                  isToday && !selected ? "border-[1.5px] border-brand" : ""
                } ${isPast ? "" : "active:opacity-70"}`}
              >
                <Text className={`text-[15px] font-medium ${textColor}`}>{day}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
