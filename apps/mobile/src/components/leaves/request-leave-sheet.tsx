import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { computeLeaveDays, type MobileLeaveBalance } from "@jambahr/shared";
import { dateRangeLabel, daysLabel, leaveErrorCopy, useApplyLeave } from "@/lib/leave";
import { DateRangePicker } from "@/components/leaves/date-range-picker";

/**
 * Request Leave bottom sheet (WF-Request-Leave: grabber + Cancel/Submit
 * header). Dependency-free slide-up Modal (same pattern as the attendance
 * day-detail sheet). Type chips from the caller's balances, an inline date
 * range picker, half-day start/end chips, a reason field, and a live derived-
 * days + balance-after preview computed client-side via the SAME shared
 * `computeLeaveDays` the server uses. Submit optimistically inserts the request
 * (via `useApplyLeave`) and closes; a server rejection surfaces inline.
 */
export function RequestLeaveSheet({
  visible,
  balances,
  orgId,
  onClose,
}: {
  visible: boolean;
  balances: MobileLeaveBalance[];
  orgId: string | null | undefined;
  onClose: () => void;
}) {
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [startHalf, setStartHalf] = useState(false);
  const [endHalf, setEndHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonFocused, setReasonFocused] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useApplyLeave(orgId);

  // Reset the whole form each time the sheet is (re)opened.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPolicyId(balances[0]?.policyId ?? null);
      setStart(null);
      setEnd(null);
      setStartHalf(false);
      setEndHalf(false);
      setReason("");
      setServerError(null);
    }
  }

  const selectedPolicy = balances.find((b) => b.policyId === policyId) ?? null;
  // A single tapped day means the user intends a single-day leave (end = start).
  const effectiveEnd = end ?? start;
  const derived =
    start && effectiveEnd
      ? computeLeaveDays(start, effectiveEnd, startHalf, endHalf)
      : null;
  const derivedDays = derived?.ok ? derived.days : null;
  const balanceAfter =
    selectedPolicy && derivedDays !== null ? selectedPolicy.remaining - derivedDays : null;

  const canSubmit = !!policyId && !!start && derived?.ok === true && !mutation.isPending;

  const submit = () => {
    if (!canSubmit || !policyId || !start) return;
    setServerError(null);
    mutation.mutate(
      {
        policyId,
        startDate: start,
        endDate: effectiveEnd ?? start,
        startHalfDay: startHalf,
        endHalfDay: endHalf,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: onClose,
        onError: (error) => setServerError(leaveErrorCopy(error)),
      }
    );
  };

  const rangeError = start && effectiveEnd && derived && !derived.ok ? derived.error : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable
            onPress={() => {}}
            className="max-h-[88%] rounded-t-2xl border border-line bg-surface pb-8 pt-2"
          >
            {/* Grabber */}
            <View className="mb-2 h-1 w-9 self-center rounded-full bg-[#bbb]" />

            {/* Cancel / title / Submit header */}
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                disabled={mutation.isPending}
                className="h-11 justify-center"
              >
                <Text className="text-[15px] text-ink-600">Cancel</Text>
              </Pressable>
              <Text className="text-[17px] font-semibold text-ink-900">Request leave</Text>
              <Pressable
                accessibilityRole="button"
                onPress={submit}
                disabled={!canSubmit}
                className="h-11 min-w-[64px] items-end justify-center"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color="#17806D" />
                ) : (
                  <Text
                    className={`text-[15px] font-semibold ${canSubmit ? "text-brand" : "text-ink-400"}`}
                  >
                    Submit
                  </Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              className="px-4"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Leave type */}
              <Text className="mb-2 mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Leave type
              </Text>
              {balances.length === 0 ? (
                <Text className="text-[13px] text-ink-600">
                  No leave policies are configured for your organization yet.
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {balances.map((b) => {
                    const active = b.policyId === policyId;
                    return (
                      <Pressable
                        key={b.policyId}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setPolicyId(b.policyId)}
                        className={`rounded-full px-3.5 py-2 ${
                          active ? "bg-brand" : "border border-line bg-surface"
                        }`}
                      >
                        <Text
                          className={`text-[13px] font-medium ${active ? "text-white" : "text-ink-900"}`}
                        >
                          {b.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Dates */}
              <Text className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Dates
              </Text>
              <View className="rounded-2xl border border-line bg-surface p-3">
                <DateRangePicker
                  start={start}
                  end={end}
                  onChange={(s, e) => {
                    setStart(s);
                    setEnd(e);
                  }}
                />
              </View>
              {start ? (
                <Text className="mt-2 text-[13px] text-ink-600">
                  {dateRangeLabel(start, effectiveEnd ?? start)}
                  {derivedDays !== null ? ` · ${daysLabel(derivedDays)}` : ""}
                </Text>
              ) : (
                <Text className="mt-2 text-[13px] text-ink-400">
                  Tap a start date, then an end date.
                </Text>
              )}

              {/* Half-day chips */}
              <Text className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Half day
              </Text>
              <View className="flex-row gap-2">
                <HalfDayChip
                  label="Half-day start"
                  active={startHalf}
                  onToggle={() => setStartHalf((v) => !v)}
                />
                <HalfDayChip
                  label="Half-day end"
                  active={endHalf}
                  onToggle={() => setEndHalf((v) => !v)}
                />
              </View>

              {/* Reason */}
              <Text className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Reason (optional)
              </Text>
              <TextInput
                className={`min-h-[68px] rounded-xl bg-surface px-3 py-2.5 text-[15px] text-ink-900 ${
                  reasonFocused ? "border-[1.5px] border-brand" : "border border-line"
                }`}
                value={reason}
                onChangeText={setReason}
                onFocus={() => setReasonFocused(true)}
                onBlur={() => setReasonFocused(false)}
                placeholder="e.g. Family function out of town"
                placeholderTextColor="#9AA1AB"
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />

              {/* Balance-after preview */}
              {selectedPolicy && derivedDays !== null && balanceAfter !== null ? (
                <View className="mt-4 flex-row items-center justify-between rounded-xl bg-brand-tint px-3 py-3">
                  <Text className="text-[13px] text-ink-600">Balance after this request</Text>
                  <Text
                    className={`text-[15px] font-semibold ${balanceAfter < 0 ? "text-danger-ontint" : "text-brand-pressed"}`}
                  >
                    {balanceAfter} {selectedPolicy.name} {balanceAfter === 1 ? "day" : "days"}
                  </Text>
                </View>
              ) : null}

              {/* Errors */}
              {rangeError || serverError ? (
                <View className="mt-3 flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
                  <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                  <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">
                    {rangeError ?? serverError}
                  </Text>
                </View>
              ) : null}

              <View className="h-4" />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function HalfDayChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onToggle}
      className={`flex-1 flex-row items-center justify-center rounded-full py-2.5 ${
        active ? "bg-brand" : "border border-line bg-surface"
      }`}
    >
      <Ionicons
        name={active ? "checkmark-circle" : "ellipse-outline"}
        size={15}
        color={active ? "#FFFFFF" : "#9AA1AB"}
      />
      <Text className={`ml-1.5 text-[13px] font-medium ${active ? "text-white" : "text-ink-900"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
