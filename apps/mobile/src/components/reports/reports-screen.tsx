import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { istToday } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { useReports } from "@/lib/reports";
import { BarChart, type BarChartDatum } from "@/components/reports/bar-chart";

type RangePreset = "7d" | "30d" | "month";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "month", label: "This month" },
];

/** `YYYY-MM-DD` + N (may be negative) days, pure calendar-date arithmetic. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Resolves a preset to a `[from, to]` pair, `to` always today (IST). */
function rangeFor(preset: RangePreset): { from: string; to: string } {
  const to = istToday();
  if (preset === "7d") return { from: addDays(to, -6), to };
  if (preset === "30d") return { from: addDays(to, -29), to };
  return { from: firstOfMonth(to), to };
}

/** "2026-08-05" -> "Aug 5", for compact bar-chart x labels. */
function shortDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(2000, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Owner/Admin Reports (Mobile D4 Task 13). Lightweight attendance + leave
 * summaries over a date-range preset — present %, late count, per-day bars,
 * and approved-leave-days by type. Deep analysis (PDF/CSV, punch detail)
 * stays web-only at /dashboard/attendance → Reports. Admin-gated by the
 * caller (see app/reports.tsx / more.tsx entry point).
 */
export function ReportsScreen() {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;
  const [preset, setPreset] = useState<RangePreset>("30d");
  const { from, to } = useMemo(() => rangeFor(preset), [preset]);

  const { attendance, leave } = useReports(orgId, from, to);

  const isInitialLoading =
    (!attendance.data && attendance.isLoading) || (!leave.data && leave.isLoading);
  const isError = (!attendance.data && attendance.isError) || (!leave.data && leave.isError);
  const refreshing = attendance.isRefetching || leave.isRefetching;

  const refetchAll = () => {
    attendance.refetch();
    leave.refetch();
  };

  const presentPerDay: BarChartDatum[] = useMemo(
    () =>
      (attendance.data?.perDay ?? []).map((d) => ({
        label: shortDayLabel(d.date),
        value: d.present,
      })),
    [attendance.data]
  );

  const latePerDay: BarChartDatum[] = useMemo(
    () =>
      (attendance.data?.perDay ?? []).map((d) => ({
        label: shortDayLabel(d.date),
        value: d.late,
      })),
    [attendance.data]
  );

  const leaveByType: BarChartDatum[] = useMemo(
    () => (leave.data?.byType ?? []).map((t) => ({ label: t.type, value: t.days })),
    [leave.data]
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-3 gap-4"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
      >
        {/* Range preset selector */}
        <View className="flex-row rounded-[10px] bg-[#EFF1F3] p-0.5">
          {PRESETS.map((p) => (
            <Pressable
              key={p.key}
              accessibilityRole="button"
              accessibilityState={{ selected: preset === p.key }}
              onPress={() => setPreset(p.key)}
              className={`flex-1 items-center justify-center rounded-lg py-2 ${
                preset === p.key ? "bg-surface" : ""
              }`}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  preset === p.key ? "text-ink-900" : "text-ink-600"
                }`}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isInitialLoading ? (
          <View className="gap-3">
            <View className="h-[180px] rounded-2xl bg-[#EFF1F3]" />
            <View className="h-[140px] rounded-2xl bg-[#EFF1F3]" />
          </View>
        ) : isError ? (
          <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-8">
            <Text className="text-[15px] font-semibold text-ink-900">
              Couldn&apos;t load reports
            </Text>
            <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
              Check your connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={refetchAll}
              className="mt-3 rounded-full bg-brand px-4 py-2 active:bg-brand-pressed"
            >
              <Text className="text-[13px] font-semibold text-white">Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Attendance card */}
            <View className="rounded-2xl border border-line bg-surface p-4">
              <Text className="text-[15px] font-semibold text-ink-900">Attendance</Text>

              <View className="mt-3 flex-row gap-6">
                <View>
                  <Text className="text-[28px] font-extrabold text-ink-900">
                    {attendance.data ? `${attendance.data.presentPct}%` : "—"}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-ink-600">present</Text>
                </View>
                <View>
                  <Text className="text-[28px] font-extrabold text-ink-900">
                    {attendance.data?.lateCount ?? "—"}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-ink-600">late</Text>
                </View>
              </View>

              {presentPerDay.length > 0 ? (
                <>
                  <Text className="mb-2 mt-4 text-[12px] font-medium text-ink-600">
                    Present per day
                  </Text>
                  <BarChart data={presentPerDay} color="#17806D" />

                  <Text className="mb-2 mt-4 text-[12px] font-medium text-ink-600">
                    Late per day
                  </Text>
                  <BarChart data={latePerDay} color="#B45309" height={80} />
                </>
              ) : (
                <Text className="mt-4 text-[13px] text-ink-400">No attendance data in range</Text>
              )}
            </View>

            {/* Leave card */}
            <View className="rounded-2xl border border-line bg-surface p-4">
              <Text className="text-[15px] font-semibold text-ink-900">Leave</Text>

              <Text className="mt-3 text-[28px] font-extrabold text-ink-900">
                {leave.data ? leave.data.totalDays : "—"}
              </Text>
              <Text className="mt-0.5 text-[12px] text-ink-600">total approved days</Text>

              {leaveByType.length > 0 ? (
                <>
                  <Text className="mb-2 mt-4 text-[12px] font-medium text-ink-600">By type</Text>
                  <BarChart data={leaveByType} color="#3B63D8" />
                </>
              ) : (
                <Text className="mt-4 text-[13px] text-ink-400">No approved leave in range</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
