import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MonthDay } from "@jambahr/shared/attendance/month-calendar";
import { istToday } from "@jambahr/shared/attendance/ist";
import type { MobileAttendanceMonthResponse } from "@jambahr/shared/mobile/types";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { attendanceMonthQueryKey, currentIstMonth } from "@/lib/attendance";
import { MonthGrid } from "@/components/attendance/month-grid";
import { StateLegend } from "@/components/attendance/state-legend";
import { DayDetailSheet } from "@/components/attendance/day-detail-sheet";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type YM = { year: number; month: number }; // month 1-12

function parseIstMonth(nowMs?: number): YM {
  const [y, m] = istToday(nowMs).split("-").map(Number);
  return { year: y, month: m };
}

/**
 * Attendance month calendar (Mobile Phase D, Slice 1, Task 6). One
 * `/api/mobile/attendance?month=YYYY-MM` query per month, cached per month key
 * (staleTime 0 for the live IST month, 5min for past months). ‹ › month nav
 * with no navigation past the current IST month; a "Today" chip jumps back;
 * pull-to-refresh; tap a day → detail bottom sheet.
 */
export default function Attendance() {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  const current = useMemo(() => parseIstMonth(), []);
  const [view, setView] = useState<YM>(current);
  const [selected, setSelected] = useState<MonthDay | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const monthStr = `${view.year}-${pad2(view.month)}`;
  const isCurrentMonth = view.year === current.year && view.month === current.month;
  const liveMonth = currentIstMonth();

  const query = useMobileQuery<MobileAttendanceMonthResponse>(
    attendanceMonthQueryKey(orgId, monthStr),
    `/api/mobile/attendance?month=${monthStr}`,
    {
      orgId,
      enabled: !!orgId,
      // Live month must reflect a just-recorded punch; past months are static.
      staleTime: monthStr === liveMonth ? 0 : 5 * 60_000,
    }
  );

  const goPrev = () =>
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { ...v, month: v.month - 1 }));
  const goNext = () => {
    if (isCurrentMonth) return; // never navigate into the future
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { ...v, month: v.month + 1 }));
  };
  const goToday = () => setView(current);

  const openDay = (day: MonthDay) => {
    setSelected(day);
    setSheetOpen(true);
  };

  const detail = useMemo(() => {
    if (!selected || !query.data) return undefined;
    return query.data.details.find((d) => d.date === selected.date);
  }, [selected, query.data]);

  const data = query.data;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-2 gap-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
        }
      >
        {/* Month header with ‹ › nav */}
        <View className="flex-row items-center justify-between pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={goPrev}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-brand-tint"
          >
            <Ionicons name="chevron-back" size={22} color="#0B1220" />
          </Pressable>

          <View className="flex-1 items-center">
            <Text className="text-[22px] font-bold leading-7 text-ink-900">
              {MONTHS[view.month - 1]} {view.year}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: isCurrentMonth }}
            disabled={isCurrentMonth}
            onPress={goNext}
            className={`h-11 w-11 items-center justify-center rounded-full ${
              isCurrentMonth ? "" : "active:bg-brand-tint"
            }`}
          >
            <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? "#9AA1AB" : "#0B1220"} />
          </Pressable>
        </View>

        {/* Today shortcut */}
        {!isCurrentMonth ? (
          <View className="flex-row justify-center">
            <Pressable
              accessibilityRole="button"
              onPress={goToday}
              className="flex-row items-center rounded-full bg-brand-tint px-3 py-1.5 active:opacity-70"
            >
              <Ionicons name="today-outline" size={14} color="#0E5E4F" />
              <Text className="ml-1.5 text-[13px] font-medium text-brand-pressed">Today</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Calendar card */}
        <View className="rounded-2xl border border-line bg-surface p-4">
          {!data && (query.isLoading || !orgId) ? (
            <CalendarSkeleton />
          ) : data ? (
            <MonthGrid
              days={data.days}
              onDayPress={openDay}
              pendingDates={data.pendingRegularizationDates}
            />
          ) : (
            <Text className="text-[15px] text-ink-600">
              Couldn&apos;t load this month. Pull to refresh once you&apos;re back online.
            </Text>
          )}
        </View>

        {/* Legend */}
        {data ? <StateLegend /> : null}
      </ScrollView>

      <DayDetailSheet
        day={selected}
        detail={detail}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        hasPendingRegularization={
          !!selected && !!data?.pendingRegularizationDates?.includes(selected.date)
        }
        orgId={orgId}
      />
    </SafeAreaView>
  );
}

function CalendarSkeleton() {
  return (
    <View className="gap-1.5">
      <View className="flex-row justify-between">
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} className="h-3 w-8 rounded bg-[#EFF1F3]" />
        ))}
      </View>
      {Array.from({ length: 5 }).map((_, r) => (
        <View key={r} className="flex-row justify-between">
          {Array.from({ length: 7 }).map((_, c) => (
            <View key={c} className="h-11 w-[13%] rounded-xl bg-[#EFF1F3]" />
          ))}
        </View>
      ))}
    </View>
  );
}
