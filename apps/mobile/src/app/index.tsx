import { Text, View } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-xl font-semibold text-primary">JambaHR</Text>
      <Text className="mt-2 text-sm text-muted-foreground">
        NativeWind + brand tokens live
      </Text>
    </View>
  );
}
