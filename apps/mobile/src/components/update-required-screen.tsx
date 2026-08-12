import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileAppConfig } from "@jambahr/shared/mobile/app-config";
import { useStrings } from "@/lib/i18n";

/**
 * Hard block for a build below the server's minimum supported version
 * (PRD-05 §6). Deliberately a dead end — there is no "continue anyway", because
 * the whole point is that this client can no longer talk to the API correctly.
 *
 * Shown only when the server explicitly says so; every uncertain case
 * (offline, malformed config, unparseable version) fails open and never reaches
 * this screen.
 */
export function UpdateRequiredScreen({
  config,
  version,
}: {
  config: MobileAppConfig;
  version: string | null;
}) {
  const copy = useStrings().update;

  const openStore = () => {
    if (config.updateUrl) void Linking.openURL(config.updateUrl);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-tint">
          <Ionicons name="cloud-download-outline" size={30} color="#17806D" />
        </View>

        <Text className="mt-5 text-center text-[24px] font-bold leading-8 text-ink-900">
          {copy.title}
        </Text>
        <Text className="mt-2 text-center text-[15px] leading-6 text-ink-600">
          {config.message ?? copy.body}
        </Text>

        {config.updateUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.ctaA11y}
            onPress={openStore}
            className="mt-6 h-12 w-full flex-row items-center justify-center rounded-xl bg-brand active:bg-brand-pressed"
          >
            <Text className="text-[15px] font-semibold text-white">{copy.cta}</Text>
          </Pressable>
        ) : (
          // No store link configured — tell people what to do instead of
          // leaving them at a button that does nothing.
          <Text className="mt-6 text-center text-[13px] leading-5 text-ink-600">
            {copy.noLinkFallback}
          </Text>
        )}

        <Text className="mt-6 text-center text-[12px] text-ink-400">
          {version ? copy.youHave(version) : copy.unknownVersion}
          {config.minVersion !== "0.0.0" ? copy.required(config.minVersion) : ""}
        </Text>
      </View>
    </SafeAreaView>
  );
}
