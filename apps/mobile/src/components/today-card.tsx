import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { MobileTodayStatus } from "@jambahr/shared/mobile/types";

/** "2026-07-17T09:31:00Z" → "9:31 AM" (device-local). */
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function splitHm(totalMinutes: number): { h: number; m: number } {
  const safe = Math.max(0, Math.floor(totalMinutes));
  return { h: Math.floor(safe / 60), m: safe % 60 };
}

/**
 * TodayCard — stat-card pattern (design §components). Shift name in caption
 * style, live worked-hours in stat style, a punch-state chip on its tint, and
 * a "Syncing" chip while the offline queue is draining.
 *
 * Live hours: while clocked in we re-render on a low-frequency tick (no
 * per-second timer per the brief) and show max(server minutesToday, elapsed
 * since clockInAt) so the number climbs monotonically without depending on a
 * precise server snapshot. Clocked out → the server's `minutesToday` as-is.
 */
export function TodayCard({
  today,
  syncing,
}: {
  today: MobileTodayStatus;
  syncing: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!today.isClockedIn) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [today.isClockedIn]);

  const clockInMs = today.clockInAt ? Date.parse(today.clockInAt) : NaN;
  const base = today.minutesToday ?? 0;
  const elapsed =
    today.isClockedIn && !Number.isNaN(clockInMs)
      ? Math.floor((now - clockInMs) / 60_000)
      : 0;
  const { h, m } = splitHm(today.isClockedIn ? Math.max(base, elapsed) : base);

  const chip = today.isClockedIn
    ? { label: "Clocked in", bg: "bg-success-tint", fg: "text-success-ontint" }
    : today.clockOutAt
      ? { label: "Clocked out", bg: "bg-warning-tint", fg: "text-warning-ontint" }
      : { label: "Not started", bg: "bg-[#EFF1F3]", fg: "text-ink-600" };

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
          {today.shift ? today.shift.name : "Today"}
        </Text>
        {syncing ? (
          <View className="flex-row items-center rounded-full bg-[#EFF1F3] px-2.5 py-1">
            <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-info" />
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
              Syncing
            </Text>
          </View>
        ) : null}
      </View>

      <View className="mt-2 flex-row items-end">
        <Text className="text-[28px] font-extrabold leading-9 text-ink-900">{h}</Text>
        <Text className="ml-0.5 mr-2 text-[15px] font-normal text-ink-600">h</Text>
        <Text className="text-[28px] font-extrabold leading-9 text-ink-900">{m}</Text>
        <Text className="ml-0.5 text-[15px] font-normal text-ink-600">m</Text>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className={`self-start rounded-full px-3 py-1 ${chip.bg}`}>
          <Text className={`text-[13px] font-medium ${chip.fg}`}>{chip.label}</Text>
        </View>
        <Text className="text-[13px] text-ink-600">
          {today.isClockedIn
            ? `In ${formatTime(today.clockInAt)}`
            : today.clockOutAt
              ? `Out ${formatTime(today.clockOutAt)}`
              : today.shift
                ? `${today.shift.start}–${today.shift.end}`
                : ""}
        </Text>
      </View>
    </View>
  );
}
