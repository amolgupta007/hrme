import { Pressable, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useSession } from "@/lib/session";

export function ProfileCard() {
  const { signOut } = useAuth();
  const { me } = useSession();

  const name =
    [me?.employee?.firstName, me?.employee?.lastName].filter(Boolean).join(" ") ||
    "—";

  return (
    <View className="flex-1 bg-background px-6 pt-6">
      <View className="rounded-lg border border-border bg-card p-5">
        <Text className="text-lg font-semibold text-card-foreground">{name}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">{me?.orgName}</Text>
        <View className="mt-3 self-start rounded-md bg-secondary px-2 py-1">
          <Text className="text-xs font-medium capitalize text-secondary-foreground">
            {me?.role}
          </Text>
        </View>
      </View>
      <Pressable
        className="mt-6 items-center rounded-lg border border-destructive py-3"
        onPress={() => void signOut()}
      >
        <Text className="font-semibold text-destructive">Sign out</Text>
      </Pressable>
    </View>
  );
}
