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
import { deletionErrorCopy, useRequestDeletion } from "@/lib/account";

/**
 * "Delete my account" confirm sheet (Phase D Slice 3, Stage C). Explains that
 * this is a REQUEST to the org's admin — attendance/payroll records are
 * retained per policy — with an optional reason. Online-only submit via
 * `useRequestDeletion`; on success the parent flips to the pending state (the
 * mutation writes the pending row into the GET cache), and this sheet closes.
 */
export function AccountDeletionSheet({
  visible,
  orgId,
  onClose,
}: {
  visible: boolean;
  orgId: string | null | undefined;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useRequestDeletion(orgId);

  // Re-seed when the sheet re-opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason("");
      setServerError(null);
    }
  }

  const submit = () => {
    if (mutation.isPending) return;
    setServerError(null);
    const trimmed = reason.trim();
    mutation.mutate(
      { reason: trimmed.length > 0 ? trimmed : undefined },
      {
        onSuccess: onClose,
        onError: (error) => setServerError(deletionErrorCopy(error)),
      },
    );
  };

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="flex-1 justify-end bg-black/40"
          onPress={onClose}
        >
          <Pressable
            onPress={() => {}}
            accessible={false}
            className="max-h-[90%] rounded-t-2xl border border-line bg-surface pb-8 pt-2"
          >
            {/* Grabber */}
            <View className="mb-2 h-1 w-9 self-center rounded-full bg-[#bbb]" />

            <ScrollView
              className="px-5"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <View className="mb-3 mt-2 h-12 w-12 items-center justify-center rounded-full bg-danger-tint">
                <Ionicons name="trash-outline" size={22} color="#B91C1C" />
              </View>

              <Text className="text-[20px] font-bold text-ink-900">Delete my account</Text>

              <Text className="mt-2 text-[14px] leading-[21px] text-ink-600">
                This sends a request to your organization&apos;s admin to remove your account. Your
                attendance and payroll records are retained per company policy. An admin will
                complete the removal.
              </Text>

              <Text className="mb-1.5 mt-5 text-[13px] font-medium text-ink-600">
                Reason (optional)
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Let your admin know why (optional)"
                placeholderTextColor="#9AA1AB"
                multiline
                maxLength={500}
                className="min-h-[80px] rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink-900"
                textAlignVertical="top"
              />

              {serverError ? (
                <View className="mt-4 flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
                  <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                  <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{serverError}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={submit}
                disabled={mutation.isPending}
                className="mt-6 h-12 flex-row items-center justify-center rounded-xl bg-danger active:opacity-90"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-[15px] font-semibold text-white">
                    Request account deletion
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                disabled={mutation.isPending}
                className="mt-2 h-12 items-center justify-center rounded-xl"
              >
                <Text className="text-[15px] font-medium text-ink-600">Cancel</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
