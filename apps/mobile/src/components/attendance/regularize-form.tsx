import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileRegularizeRequest } from "@jambahr/shared/mobile/types";
import { regularizeErrorCopy, useRegularize } from "@/lib/use-regularize";

/** 24h wall-clock, e.g. "09:30". */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** IST wall-clock on `date` → full ISO instant the BFF validates against. */
function toIstIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+05:30`;
}

/**
 * Regularization request form, rendered inside the day-detail sheet for a
 * past day. Proposed in (required) + proposed out (optional) as 24h IST
 * wall-clock times, plus a required reason. Design: 44pt radius-12 1pt-border
 * inputs (focused 1.5pt brand), 50pt radius-14 primary button.
 */
export function RegularizeForm({
  date,
  orgId,
  onSuccess,
  onCancel,
}: {
  date: string; // YYYY-MM-DD (IST)
  orgId: string | null | undefined;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [focused, setFocused] = useState<"in" | "out" | "reason" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useRegularize(orgId);

  const submit = () => {
    setLocalError(null);
    setServerError(null);

    if (!TIME_RE.test(inTime)) {
      setLocalError("Enter the punch-in time as HH:MM (24h), e.g. 09:30.");
      return;
    }
    const hasOut = outTime.trim().length > 0;
    if (hasOut && !TIME_RE.test(outTime)) {
      setLocalError("Enter the punch-out time as HH:MM (24h), or leave it blank.");
      return;
    }
    if (hasOut && outTime <= inTime) {
      setLocalError("Punch-out must be after punch-in.");
      return;
    }
    if (reason.trim().length < 3) {
      setLocalError("Please add a short reason for the correction.");
      return;
    }

    const body: MobileRegularizeRequest = {
      date,
      proposedIn: toIstIso(date, inTime),
      proposedOut: hasOut ? toIstIso(date, outTime) : null,
      reason: reason.trim(),
    };
    mutation.mutate(body, {
      onSuccess,
      onError: (error) => setServerError(regularizeErrorCopy(error)),
    });
  };

  const inputClass = (name: "in" | "out" | "reason") =>
    `rounded-xl bg-surface px-3 text-[15px] text-ink-900 ${
      focused === name ? "border-[1.5px] border-brand" : "border border-line"
    }`;

  const error = localError ?? serverError;

  return (
    <View>
      <Text className="mb-3 text-[13px] leading-5 text-ink-600">
        Propose the punch times you missed. Your manager reviews and approves the
        correction before it counts.
      </Text>

      {/* In / out times side by side */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="mb-1.5 text-[13px] font-medium text-ink-600">In time (IST)</Text>
          <TextInput
            className={`h-11 ${inputClass("in")}`}
            value={inTime}
            onChangeText={setInTime}
            onFocus={() => setFocused("in")}
            onBlur={() => setFocused(null)}
            placeholder="09:30"
            placeholderTextColor="#9AA1AB"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View className="flex-1">
          <Text className="mb-1.5 text-[13px] font-medium text-ink-600">Out time (optional)</Text>
          <TextInput
            className={`h-11 ${inputClass("out")}`}
            value={outTime}
            onChangeText={setOutTime}
            onFocus={() => setFocused("out")}
            onBlur={() => setFocused(null)}
            placeholder="18:00"
            placeholderTextColor="#9AA1AB"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Reason */}
      <Text className="mb-1.5 mt-3 text-[13px] font-medium text-ink-600">Reason</Text>
      <TextInput
        className={`min-h-[68px] py-2.5 ${inputClass("reason")}`}
        value={reason}
        onChangeText={setReason}
        onFocus={() => setFocused("reason")}
        onBlur={() => setFocused(null)}
        placeholder="e.g. Forgot to punch — was at a client site"
        placeholderTextColor="#9AA1AB"
        multiline
        maxLength={500}
        textAlignVertical="top"
      />

      {error ? (
        <View className="mt-3 flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
          <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
          <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{error}</Text>
        </View>
      ) : null}

      {/* Submit / cancel */}
      <Pressable
        accessibilityRole="button"
        disabled={mutation.isPending}
        onPress={submit}
        className={`mt-4 h-[50px] flex-row items-center justify-center rounded-[14px] active:bg-brand-pressed ${
          mutation.isPending ? "bg-brand/70" : "bg-brand"
        }`}
      >
        {mutation.isPending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
            <Text className="ml-2 text-[17px] font-semibold text-white">Submit request</Text>
          </>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        disabled={mutation.isPending}
        className="mt-2 h-11 items-center justify-center rounded-xl active:bg-brand-tint"
      >
        <Text className="text-[15px] font-medium text-ink-600">Cancel</Text>
      </Pressable>
    </View>
  );
}
