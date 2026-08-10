import { Text, View } from "react-native";
import type { MonthDayState } from "@jambahr/shared/attendance/month-calendar";

/**
 * The state → colour vocabulary for the attendance calendar. Single source
 * shared by the grid cells, this legend, and the day-detail sheet badge, so
 * the "status colours always sit on their tint" rule (design §usage rule 2)
 * is applied identically everywhere.
 *
 * `cell*` styles the grid tile; `chip*` styles the legend/sheet pills (same
 * tints). Neutral states (week_off/future/no_data) use the `#EFF1F3` fill with
 * muted ink per the design's "week-off = ink/400 on #EFF1F3" note.
 */
export type StateMeta = {
  label: string;
  cellBg: string;
  cellText: string;
  chipBg: string;
  chipText: string;
};

const NEUTRAL = {
  cellBg: "bg-[#EFF1F3]",
  cellText: "text-ink-400",
  chipBg: "bg-[#EFF1F3]",
  chipText: "text-ink-600",
};

const PLAIN = {
  cellBg: "bg-transparent",
  cellText: "text-ink-400",
  chipBg: "bg-[#EFF1F3]",
  chipText: "text-ink-600",
};

export const STATE_META: Record<MonthDayState, StateMeta> = {
  present: {
    label: "Present",
    cellBg: "bg-success-tint",
    cellText: "text-success-ontint",
    chipBg: "bg-success-tint",
    chipText: "text-success-ontint",
  },
  half_day: {
    label: "Half day",
    cellBg: "bg-warning-tint",
    cellText: "text-warning-ontint",
    chipBg: "bg-warning-tint",
    chipText: "text-warning-ontint",
  },
  absent: {
    label: "Absent",
    cellBg: "bg-danger-tint",
    cellText: "text-danger-ontint",
    chipBg: "bg-danger-tint",
    chipText: "text-danger-ontint",
  },
  leave: {
    label: "On leave",
    cellBg: "bg-info-tint",
    cellText: "text-info-ontint",
    chipBg: "bg-info-tint",
    chipText: "text-info-ontint",
  },
  holiday: {
    label: "Holiday",
    cellBg: "bg-info-tint",
    cellText: "text-info-ontint",
    chipBg: "bg-info-tint",
    chipText: "text-info-ontint",
  },
  week_off: { label: "Weekly off", ...NEUTRAL },
  future: { label: "Upcoming", ...PLAIN },
  no_data: { label: "No punch yet", cellBg: "bg-transparent", cellText: "text-ink-600", chipBg: "bg-[#EFF1F3]", chipText: "text-ink-600" },
};

/** States surfaced in the legend (skip the plain future/no_data non-events). */
const LEGEND_STATES: MonthDayState[] = [
  "present",
  "half_day",
  "absent",
  "leave",
  "holiday",
  "week_off",
];

export function StateLegend() {
  return (
    <View className="flex-row flex-wrap gap-2">
      {LEGEND_STATES.map((state) => {
        const meta = STATE_META[state];
        return (
          <View
            key={state}
            className={`flex-row items-center rounded-full px-2.5 py-1 ${meta.chipBg}`}
          >
            <Text className={`text-[11px] font-medium ${meta.chipText}`}>{meta.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
