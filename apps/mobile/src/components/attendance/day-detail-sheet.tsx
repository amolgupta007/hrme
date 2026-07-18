import { useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MonthDay } from "@jambahr/shared/attendance/month-calendar";
import type { MobileAttendanceDayDetail } from "@jambahr/shared/mobile/types";
import { istToday } from "@jambahr/shared/attendance/ist";
import { STATE_META } from "@/components/attendance/state-legend";
import { RegularizeForm } from "@/components/attendance/regularize-form";

/** Reliable monospace family for the hours readout (design: money/duration mono). */
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const FULL_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-01" → "Wed, 1 Jul 2026" (plain calendar parse, no tz shift). */
function longDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const weekday = dt.toLocaleDateString([], { weekday: "short" });
  return `${weekday}, ${d} ${FULL_MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** "2026-07-17T09:31:00Z" → "9:31 AM" (device-local). */
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Worked duration for a completed pair; "In progress" while a punch is open. */
function pairHours(inIso: string | null, outIso: string | null): string {
  if (!inIso) return "—";
  if (!outIso) return "In progress";
  const a = Date.parse(inIso);
  const b = Date.parse(outIso);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "—";
  const mins = Math.floor((b - a) / 60_000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

const SOURCE_LABEL: Record<string, string> = {
  mobile: "Mobile",
  device: "Device",
  web: "Web",
  adms: "Device",
  auto_close: "Auto-closed",
};

/**
 * Bottom sheet for a tapped calendar day. Dependency-free — a slide-up
 * `Modal` with a tap-scrim backdrop and a card (grabber pill, design §usage).
 * Shows the day's state, punch pairs (in/out + monospace hours), the record
 * source chip(s), an out-of-zone note when relevant, and — for past
 * non-holiday days — the "Request correction" regularization flow (Task 7):
 * a form proposing in/out + reason that lands as pending punch events for
 * admin review. `hasPendingRegularization` renders the amber "Correction
 * pending" chip.
 */
export function DayDetailSheet({
  day,
  detail,
  visible,
  onClose,
  hasPendingRegularization = false,
  orgId,
}: {
  day: MonthDay | null;
  detail: MobileAttendanceDayDetail | undefined;
  visible: boolean;
  onClose: () => void;
  hasPendingRegularization?: boolean;
  orgId?: string | null;
}) {
  const meta = day ? STATE_META[day.state] : null;
  const pairs = detail?.pairs ?? [];
  const hasPunches = pairs.some((p) => p.in || p.out);

  type Mode = "detail" | "form" | "success";
  const [mode, setMode] = useState<Mode>("detail");
  // Reset the sheet back to the detail view whenever it targets a new day
  // (render-adjust on a changed dependency — same idiom as use-punch.ts).
  const [trackedDate, setTrackedDate] = useState(day?.date);
  if (trackedDate !== day?.date) {
    setTrackedDate(day?.date);
    setMode("detail");
  }

  // Regularization is for PAST days only (today's fixes go through normal
  // punching) and never for holidays. Week-off/leave days stay eligible — an
  // employee may genuinely have worked one.
  const canRequestCorrection =
    !!day && day.date < istToday() && day.state !== "holiday";

  const close = () => {
    setMode("detail");
    onClose();
  };

  const sourceChips: string[] = [];
  if (detail?.source && SOURCE_LABEL[detail.source]) sourceChips.push(SOURCE_LABEL[detail.source]);
  if (detail?.autoClosed && !sourceChips.includes("Auto-closed")) sourceChips.push("Auto-closed");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={close}>
        {/* Stop propagation so taps inside the card don't dismiss. */}
        <Pressable
          onPress={() => {}}
          className="rounded-t-2xl border border-line bg-surface px-4 pb-8 pt-2"
        >
          {/* Grabber */}
          <View className="mb-3 h-1 w-9 self-center rounded-full bg-[#bbb]" />

          {day && meta ? (
            <>
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-[17px] font-semibold text-ink-900">{longDate(day.date)}</Text>
                <View className="flex-row items-center gap-1.5">
                  {hasPendingRegularization ? (
                    <View className="rounded-full bg-warning-tint px-2.5 py-1">
                      <Text className="text-[11px] font-medium text-warning-ontint">Pending</Text>
                    </View>
                  ) : null}
                  <View className={`rounded-full px-2.5 py-1 ${meta.chipBg}`}>
                    <Text className={`text-[11px] font-medium ${meta.chipText}`}>{meta.label}</Text>
                  </View>
                </View>
              </View>

              {mode === "form" ? (
                <RegularizeForm
                  date={day.date}
                  orgId={orgId}
                  onSuccess={() => setMode("success")}
                  onCancel={() => setMode("detail")}
                />
              ) : mode === "success" ? (
                <View className="items-center py-4">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-success-tint">
                    <Ionicons name="checkmark" size={26} color="#177245" />
                  </View>
                  <Text className="mt-3 text-[17px] font-semibold text-ink-900">
                    Request sent
                  </Text>
                  <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
                    Your correction is pending — it counts toward your attendance once your
                    manager approves it.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={close}
                    className="mt-4 h-11 w-full items-center justify-center rounded-xl border border-line bg-surface active:bg-brand-tint"
                  >
                    <Text className="text-[15px] font-medium text-ink-900">Done</Text>
                  </Pressable>
                </View>
              ) : (
                <>
              {/* Punch pairs */}
              {hasPunches ? (
                <View className="rounded-xl border border-line">
                  {pairs.map((p, i) => (
                    <View
                      key={`${p.in ?? "x"}-${p.out ?? "x"}-${i}`}
                      className={`flex-row items-center px-3 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
                    >
                      <Ionicons name="log-in-outline" size={16} color="#177245" />
                      <Text className="ml-1.5 text-[15px] text-ink-900">{formatTime(p.in)}</Text>
                      <Ionicons name="arrow-forward" size={14} color="#9AA1AB" style={{ marginHorizontal: 8 }} />
                      <Ionicons name="log-out-outline" size={16} color="#B45309" />
                      <Text className="ml-1.5 text-[15px] text-ink-900">{formatTime(p.out)}</Text>
                      <Text
                        className="ml-auto text-[13px] text-ink-600"
                        style={{ fontFamily: MONO }}
                      >
                        {pairHours(p.in, p.out)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="rounded-xl bg-[#EFF1F3] px-3 py-3">
                  <Text className="text-[15px] text-ink-600">
                    {day.state === "week_off"
                      ? "Weekly off — no punches expected."
                      : day.state === "holiday"
                        ? "Holiday — no punches expected."
                        : day.state === "leave"
                          ? "On approved leave."
                          : day.state === "no_data"
                            ? "No punches recorded yet today."
                            : "No punches recorded for this day."}
                  </Text>
                </View>
              )}

              {/* Source + out-of-zone */}
              {sourceChips.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {sourceChips.map((label) => (
                    <View key={label} className="rounded-full bg-brand-tint px-2.5 py-1">
                      <Text className="text-[11px] font-medium text-brand-pressed">{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {detail && detail.outOfZoneCount > 0 ? (
                <View className="mt-3 flex-row items-center rounded-xl bg-warning-tint px-3 py-2.5">
                  <Ionicons name="location-outline" size={16} color="#8A5A06" />
                  <Text className="ml-2 flex-1 text-[13px] text-warning-ontint">
                    {detail.outOfZoneCount} punch{detail.outOfZoneCount === 1 ? "" : "es"} outside
                    your assigned zone.
                  </Text>
                </View>
              ) : null}

              {/* Request correction — past non-holiday days only. */}
              {hasPendingRegularization ? (
                <View className="mt-4 flex-row items-center justify-center rounded-xl bg-warning-tint px-3 py-2.5">
                  <Ionicons name="hourglass-outline" size={16} color="#8A5A06" />
                  <Text className="ml-1.5 text-[13px] font-medium text-warning-ontint">
                    Correction pending review
                  </Text>
                </View>
              ) : canRequestCorrection ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMode("form")}
                  className="mt-4 h-11 flex-row items-center justify-center rounded-xl border border-line bg-surface active:bg-brand-tint"
                >
                  <Ionicons name="create-outline" size={16} color="#17806D" />
                  <Text className="ml-1.5 text-[15px] font-medium text-brand">
                    Request correction
                  </Text>
                </Pressable>
              ) : null}
                </>
              )}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
