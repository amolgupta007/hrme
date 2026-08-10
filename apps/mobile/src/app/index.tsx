import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { hasPermission } from "@jambahr/shared";
import { useSession } from "@/lib/session";

export default function Index() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { me, loading, error, refresh } = useSession();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  if (loading || (!me && !error)) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (error === "no_membership") {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-base font-semibold text-foreground">
          Your account isn&apos;t linked to an organisation yet.
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Ask your admin to add you in JambaHR, then sign in again.
        </Text>
        <Pressable className="mt-6" onPress={() => void signOut()}>
          <Text className="font-semibold text-primary">Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (error === "unauthenticated") {
    // Session token is invalid/expired server-side. Retrying won't help —
    // only a fresh sign-in will. Closes the Phase C follow-up (previously
    // this fell through to the generic "check your connection" retry CTA).
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-base font-semibold text-foreground">
          Your session has expired.
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Sign out and sign back in to continue.
        </Text>
        <Pressable className="mt-6" onPress={() => void signOut()}>
          <Text className="font-semibold text-primary">Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (error || !me) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-sm text-muted-foreground">
          Couldn&apos;t reach JambaHR. Check your connection.
        </Text>
        <Pressable className="mt-6" onPress={() => void refresh()}>
          <Text className="font-semibold text-primary">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return hasPermission(me.role, "admin") ? (
    <Redirect href="/(admin)/home" />
  ) : (
    <Redirect href="/(staff)/home" />
  );
}
