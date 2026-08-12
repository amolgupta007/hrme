import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { selectionFeedback } from "@/lib/haptics";
import { useStrings } from "@/lib/i18n";

/**
 * DPDP notice shown once, before the OS location prompt (Mobile D5).
 *
 * Two reasons this exists rather than going straight to the system dialog:
 *
 *  - **Legal.** India's DPDP Act expects a notice stating what is collected,
 *    why, and by whom — the bare iOS string is too short to carry that.
 *  - **Practical.** iOS never re-prompts after a denial. A cold system prompt
 *    with no context gets declined, and then the feature is permanently dead
 *    for that user short of a trip to Settings.
 *
 * The notice is informational: continuing leads to the OS prompt, which is
 * where actual consent is given and can be withdrawn at any time.
 */
export function LocationConsentSheet({
  visible,
  orgName,
  required,
  onContinue,
  onClose,
}: {
  visible: boolean;
  orgName: string | null | undefined;
  /** Org is in `required` mode — declining means they cannot clock in. */
  required: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const t = useStrings();
  const copy = t.location.consent;
  const org = orgName?.trim() || "your organisation";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[85%] rounded-t-3xl bg-surface pb-8 pt-2">
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-line" />

          <ScrollView contentContainerClassName="px-5 pb-2" showsVerticalScrollIndicator={false}>
            <View className="mb-3 mt-1 h-11 w-11 items-center justify-center rounded-full bg-brand-tint">
              <Ionicons name="location-outline" size={22} color="#17806D" />
            </View>

            <Text className="text-[22px] font-bold leading-7 text-ink-900">
              {copy.title}
            </Text>
            <Text className="mt-2 text-[15px] leading-6 text-ink-600">
              {copy.intro(org)}
            </Text>

            <View className="mt-4 gap-3 rounded-2xl bg-canvas p-4">
              <Point
                icon="time-outline"
                title={copy.points.whenTitle}
                body={copy.points.whenBody}
              />
              <Point
                icon="business-outline"
                title={copy.points.employerTitle}
                body={copy.points.employerBody}
              />
              <Point
                icon="lock-closed-outline"
                title={copy.points.controlTitle}
                body={copy.points.controlBody}
              />
            </View>

            {required ? (
              <View className="mt-4 flex-row items-start rounded-2xl bg-warning-tint p-3">
                <Ionicons name="alert-circle-outline" size={18} color="#92400E" />
                <Text className="ml-2 flex-1 text-[13px] leading-5 text-warning-ontint">
                  {copy.requiredWarning(org)}
                </Text>
              </View>
            ) : (
              <Text className="mt-4 text-[13px] leading-5 text-ink-600">
                {copy.optionalNote}
              </Text>
            )}
          </ScrollView>

          <View className="mt-4 gap-2 px-5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.continueA11y}
              onPress={() => {
                selectionFeedback();
                onContinue();
              }}
              className="h-12 flex-row items-center justify-center rounded-xl bg-brand active:bg-brand-pressed"
            >
              <Text className="text-[15px] font-semibold text-white">{t.common.continue}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.common.notNow}
              onPress={onClose}
              className="h-12 items-center justify-center rounded-xl active:bg-canvas"
            >
              <Text className="text-[15px] font-medium text-ink-600">{t.common.notNow}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Point({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
}) {
  return (
    <View className="flex-row items-start">
      <Ionicons name={icon} size={18} color="#5B6472" style={{ marginTop: 2 }} />
      <View className="ml-3 flex-1">
        <Text className="text-[14px] font-semibold text-ink-900">{title}</Text>
        <Text className="mt-0.5 text-[13px] leading-5 text-ink-600">{body}</Text>
      </View>
    </View>
  );
}
