import { ScrollView, Text, View } from "react-native";

export type BarChartDatum = { label: string; value: number };

const BAR_WIDTH = 30;
const BAR_GAP = 6;
/** Space reserved above/below the bar for the value + label lines. */
const LABEL_CHROME_HEIGHT = 34;

/**
 * Hand-rolled bar chart using plain `View`s — no charting dependency (D4
 * Task 13 constraint: mobile Reports stays lightweight, deep analysis is
 * web-only). Bar heights are proportional to `value / max(values)`. Series
 * longer than fit on screen (e.g. 30 daily bars) scroll horizontally at a
 * fixed bar width rather than squeezing bars/labels into illegibility.
 */
export function BarChart({
  data,
  color = "#17806D",
  height = 120,
  emptyLabel = "No data",
}: {
  data: BarChartDatum[];
  color?: string;
  height?: number;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <View style={{ height }} className="items-center justify-center">
        <Text className="text-[13px] text-ink-400">{emptyLabel}</Text>
      </View>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const barAreaHeight = Math.max(height - LABEL_CHROME_HEIGHT, 20);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ height }}
      contentContainerStyle={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: BAR_GAP,
        paddingHorizontal: 2,
      }}
    >
      {data.map((d, i) => {
        const barHeight = Math.max(2, Math.round((d.value / max) * barAreaHeight));
        return (
          <View key={`${d.label}-${i}`} style={{ width: BAR_WIDTH }} className="items-center">
            <Text className="mb-1 text-[10px] font-medium text-ink-600" numberOfLines={1}>
              {d.value}
            </Text>
            <View
              className="w-full rounded-t-sm"
              style={{ height: barHeight, minHeight: 2, backgroundColor: color }}
            />
            <Text className="mt-1 text-[10px] text-ink-400" numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
