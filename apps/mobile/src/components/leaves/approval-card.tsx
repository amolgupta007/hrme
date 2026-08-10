import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileLeaveApprovalItem } from "@jambahr/shared/mobile/leave";
import { dateRangeLabel, daysLabel } from "@/lib/leave";

/**
 * One pending-decision card (hi-fi 2c): requester avatar + name + `{dept} ·
 * reports to you` sub + type chip; labeled DATES / BALANCE AFTER rows; quoted
 * reason; a team-overlap advisory (✓ success tint / ⚠ warning tint); and an
 * Approve (primary) / Reject (destructive tint) pair. Reject reveals an
 * optional comment field before confirming. Decision mutation lives in the
 * parent; `busy` disables the actions while it's in flight.
 */
export function ApprovalCard({
  item,
  onApprove,
  onReject,
  busy = false,
}: {
  item: MobileLeaveApprovalItem;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string, comment?: string) => void;
  busy?: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [commentFocused, setCommentFocused] = useState(false);

  const overdraw = item.balanceAfter < 0;

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      {/* Requester */}
      <View className="flex-row items-center">
        <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
          <Text className="text-[13px] font-bold text-brand-pressed">
            {item.requesterInitials || "?"}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-semibold text-ink-900" numberOfLines={1}>
            {item.requesterName}
          </Text>
          <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={1}>
            {[item.department, item.isDirectReport ? "reports to you" : null]
              .filter(Boolean)
              .join(" · ") || " "}
          </Text>
        </View>
        <View className="rounded-full bg-info-tint px-2.5 py-1">
          <Text className="text-[13px] font-medium text-info-ontint">
            {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
          </Text>
        </View>
      </View>

      {/* Labeled rows */}
      <View className="mt-3 gap-2">
        <LabeledRow
          label="DATES"
          value={`${dateRangeLabel(item.startDate, item.endDate)} · ${daysLabel(item.days)}`}
        />
        <LabeledRow
          label="BALANCE AFTER"
          value={daysLabel(item.balanceAfter)}
          danger={overdraw}
        />
      </View>

      {/* Reason */}
      {item.reason ? (
        <Text className="mt-3 text-[13px] italic leading-5 text-ink-600">
          &ldquo;{item.reason}&rdquo;
        </Text>
      ) : null}

      {/* Overlap advisory */}
      <View
        className={`mt-3 flex-row items-center rounded-xl px-3 py-2 ${
          item.teamOverlap ? "bg-warning-tint" : "bg-success-tint"
        }`}
      >
        <Ionicons
          name={item.teamOverlap ? "warning-outline" : "checkmark-circle-outline"}
          size={15}
          color={item.teamOverlap ? "#8A5A06" : "#177245"}
        />
        <Text
          className={`ml-2 flex-1 text-[13px] ${
            item.teamOverlap ? "text-warning-ontint" : "text-success-ontint"
          }`}
        >
          {item.teamOverlap
            ? `Overlaps ${item.teamOverlap.name}'s approved leave`
            : "No overlap with other team leave"}
        </Text>
      </View>

      {/* Reject comment (revealed on Reject) */}
      {rejecting ? (
        <TextInput
          className={`mt-3 min-h-[52px] rounded-xl bg-surface px-3 py-2.5 text-[15px] text-ink-900 ${
            commentFocused ? "border-[1.5px] border-brand" : "border border-line"
          }`}
          value={comment}
          onChangeText={setComment}
          onFocus={() => setCommentFocused(true)}
          onBlur={() => setCommentFocused(false)}
          placeholder="Reason for rejecting (optional)"
          placeholderTextColor="#9AA1AB"
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />
      ) : null}

      {/* Actions */}
      <View className="mt-3 flex-row gap-3">
        {rejecting ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setRejecting(false)}
              className="flex-1 h-11 items-center justify-center rounded-xl border border-line bg-surface active:bg-brand-tint"
            >
              <Text className="text-[15px] font-medium text-ink-600">Back</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onReject(item.requestId, comment.trim() || undefined)}
              className="flex-1 h-11 items-center justify-center rounded-xl bg-danger-tint active:opacity-80"
            >
              <Text className="text-[15px] font-semibold text-danger-ontint">
                {busy ? "Rejecting…" : "Confirm reject"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setRejecting(true)}
              className="flex-1 h-11 items-center justify-center rounded-xl bg-danger-tint active:opacity-80"
            >
              <Text className="text-[15px] font-semibold text-danger-ontint">Reject</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onApprove(item.requestId)}
              className="flex-1 h-11 items-center justify-center rounded-xl bg-brand active:bg-brand-pressed"
            >
              <Text className="text-[15px] font-semibold text-white">
                {busy ? "Approving…" : "Approve"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function LabeledRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </Text>
      <Text className={`text-[15px] font-medium ${danger ? "text-danger-ontint" : "text-ink-900"}`}>
        {value}
      </Text>
    </View>
  );
}
