import { Text, View } from "react-native";
import { useSession } from "@/lib/session";

export default function AdminHome() {
  const { me } = useSession();
  return (
    <View className="flex-1 bg-background px-6 pt-6">
      <Text className="text-xl font-bold text-foreground">
        Hi {me?.employee?.firstName ?? "there"} 👋
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">
        {me?.orgName} · Admin
      </Text>
    </View>
  );
}
