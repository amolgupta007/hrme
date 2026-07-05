import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import type { MobileMeResponse } from "@jambahr/shared/auth/types";
import { useApi, ApiError } from "@/lib/api";

export default function Index() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const apiFetch = useApi();
  const [me, setMe] = useState<MobileMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    apiFetch<MobileMeResponse>("/api/mobile/me")
      .then(setMe)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <ScrollView className="flex-1 bg-background px-6 pt-16">
      <Text className="text-lg font-bold text-foreground">/api/mobile/me spike</Text>
      {error && <Text className="mt-4 text-destructive">{error}</Text>}
      {!me && !error && <ActivityIndicator className="mt-8" />}
      {me && (
        <Text className="mt-4 font-mono text-xs text-foreground">
          {JSON.stringify(me, null, 2)}
        </Text>
      )}
      <Pressable
        className="mb-16 mt-8 items-center rounded-lg bg-secondary py-3"
        onPress={() => void signOut()}
      >
        <Text className="font-semibold text-secondary-foreground">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
