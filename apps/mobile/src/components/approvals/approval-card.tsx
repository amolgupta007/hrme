import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileApprovalItem, MobileApprovalType } from "@jambahr/shared";

/** Per-type chip/icon styling — the visual "type chip" the brief calls for. */
const TYPE_META: Record<
  MobileApprovalType,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconBg: string;
    iconColor: string;
    chipBg: string;
    chipFg: string;
  }
> = {
  leave: {
    label: "Leave",
    icon: "calendar-outline",
    iconBg: "bg-info-tint",
    iconColor: "#2A4BB5",
    chipBg: "bg-info-tint",
    chipFg: "text-info-ontint",
  },
  regularization: {
    label: "Regularization",
    icon: "finger-print-outline",
    iconBg: "bg-warning-tint",
    iconColor: "#8A5A06",
    chipBg: "bg-warning-tint",
    chipFg: "text-warning-ontint",
  },
  ot: {
    label: "Overtime",
    icon: "time-outline",
    iconBg: "bg-brand-tint",
    iconColor: "#0E5E4F",
    chipBg: "bg-brand-tint",
    chipFg: "text-brand-pressed",
  },
  payroll: {
    label: "Payroll",
    icon: "cash-outline",
    iconBg: "bg-success-tint",
    iconColor: "#177245",
    chipBg: "bg-success-tint",
    chipFg: "text-success-ontint",
  },
};

/** "2026-08-01T10:00:00Z" → "2h ago" / "3d ago" / "2w ago" (device-local). */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, Date.now() - then);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/**
 * One row of the unified Approvals inbox (Mobile D4 Owner/Admin, Task 11).
 * Generic across the 4 merged types — the type chip + icon + copy differ,
 * the who/what/WHEN/IMPACT + Approve/Reject shape is shared. Payroll has no
 * reject path (RazorpayX disbursement rejection isn't modeled server-side —
 * `/api/mobile/approvals/decide` 400s it) so its card shows a "Reject on
 * web" hint instead of a working button. Reject on every other type opens an
 * inline comment field — the server 400s a commentless non-payroll reject
 * (`comment_required`), so the Confirm button stays disabled until there's
 * text, matching that contract instead of surfacing the error round-trip.
 *
 * `selectable` (leave batch-approve mode) swaps the leading icon for a
 * checkbox but leaves the normal Approve/Reject row in place — selecting a
 * card for the batch action and deciding it individually are independent,
 * not mutually exclusive.
 */
export function ApprovalCard({
  item,
  busy = false,
  onApprove,
  onReject,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  item: MobileApprovalItem;
  busy?: boolean;
  onApprove: (item: MobileApprovalItem) => void;
  onReject: (item: MobileApprovalItem, comment: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [commentFocused, setCommentFocused] = useState(false);

  const meta = TYPE_META[item.type];
  const canReject = item.type !== "payroll";
  const trimmedComment = comment.trim();

  return (
    <View
      className={`rounded-2xl border p-4 ${
        selected ? "border-brand bg-brand-tint" : "border-line bg-surface"
      }`}
    >
      {/* Header: avatar/checkbox + who/what + type chip */}
      <View className="flex-row items-start">
        {selectable ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={() => onToggleSelect?.(item.id)}
            className={`mr-3 mt-1 h-7 w-7 items-center justify-center rounded-full border-2 ${
              selected ? "border-brand bg-brand" : "border-line bg-surface"
            }`}
          >
            {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
          </Pressable>
        ) : (
          <View className={`mr-3 h-10 w-10 items-center justify-center rounded-full ${meta.iconBg}`}>
            <Ionicons name={meta.icon} size={18} color={meta.iconColor} />
          </View>
        )}
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-[16px] font-semibold text-ink-900" numberOfLines={1}>
              {item.who}
            </Text>
            <View className={`shrink-0 rounded-full px-2.5 py-1 ${meta.chipBg}`}>
              <Text className={`text-[12px] font-medium ${meta.chipFg}`}>{meta.label}</Text>
            </View>
          </View>
          <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={1}>
            {item.what}
          </Text>
        </View>
      </View>

      {/* Labeled rows */}
      <View className="mt-3 gap-2">
        <LabeledRow label="WHEN" value={relativeTime(item.when)} />
        <LabeledRow label="IMPACT" value={item.impact} />
      </View>

      {/* Reject comment (revealed on Reject, required for non-payroll types) */}
      {rejecting ? (
        <TextInput
          className={`mt-3 min-h-[52px] rounded-xl bg-surface px-3 py-2.5 text-[15px] text-ink-900 ${
            commentFocused ? "border-[1.5px] border-brand" : "border border-line"
          }`}
          value={comment}
          onChangeText={setComment}
          onFocus={() => setCommentFocused(true)}
          onBlur={() => setCommentFocused(false)}
          placeholder="Reason for rejecting (required)"
          placeholderTextColor="#6A727E"
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
              onPress={() => {
                setRejecting(false);
                setComment("");
              }}
              className="flex-1 h-11 items-center justify-center rounded-xl border border-line bg-surface active:bg-brand-tint"
            >
              <Text className="text-[15px] font-medium text-ink-600">Back</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy || trimmedComment.length === 0}
              onPress={() => onReject(item, trimmedComment)}
              className={`flex-1 h-11 items-center justify-center rounded-xl active:opacity-80 ${
                trimmedComment.length === 0 ? "bg-[#EFF1F3]" : "bg-danger-tint"
              }`}
            >
              <Text
                className={`text-[15px] font-semibold ${
                  trimmedComment.length === 0 ? "text-ink-400" : "text-danger-ontint"
                }`}
              >
                {busy ? "Rejecting…" : "Confirm reject"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            {canReject ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setRejecting(true)}
                className="flex-1 h-11 items-center justify-center rounded-xl bg-danger-tint active:opacity-80"
              >
                <Text className="text-[15px] font-semibold text-danger-ontint">Reject</Text>
              </Pressable>
            ) : (
              <View className="flex-1 h-11 items-center justify-center rounded-xl border border-line bg-surface">
                <Text className="text-[13px] text-ink-400">Reject on web</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onApprove(item)}
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

function LabeledRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </Text>
      <Text className="flex-1 text-right text-[14px] font-medium text-ink-900" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
