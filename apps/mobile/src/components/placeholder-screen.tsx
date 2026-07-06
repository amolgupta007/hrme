import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette } from "@jambahr/config/tokens";

export function PlaceholderScreen({
  title,
  blurb,
  icon,
}: {
  title: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-10">
      <Ionicons name={icon} size={40} color={palette.light.mutedForeground} />
      <Text className="mt-4 text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">{blurb}</Text>
    </View>
  );
}
