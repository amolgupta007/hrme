import "../../global.css";
import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { QueryProvider } from "@/lib/query";
import { SessionProvider } from "@/lib/session";
import { routeForNotificationType } from "@/lib/notifications";
import { useAppConfig } from "@/lib/app-config";
import { UpdateRequiredScreen } from "@/components/update-required-screen";
import { markColdStartInteractive } from "@/lib/startup";

/**
 * Root Stack (Slice 2 Task 5). Previously a bare `<Slot />` — promoted to a
 * Stack navigator so the new top-level screens (`attendance`, `payslips`,
 * `profile`) opened off the `(tabs)` group get a real back nav + header.
 * `(auth)`, `index`, and `(tabs)` keep their own chrome (or none) via
 * `headerShown: false` here — unchanged from the previous Slot behavior.
 */
function RootLayout() {
  const router = useRouter();
  const { blocked, config, version } = useAppConfig();

  // Cold-start budget instrumentation (PRD-04 §4: interactive Home < 2s).
  // Fires once, on the first committed render of the root navigator.
  useEffect(() => {
    markColdStartInteractive();
  }, []);

  // Push-tap routing (D3 Stage D). Reads the notification's `data.type`
  // (set by notify() in apps/web/src/lib/mobile/notify.ts) and deep-links.
  // Handles both a tap while running (response listener) and a cold-start
  // tap from a killed app (getLastNotificationResponseAsync). Unknown/absent
  // type falls back to the notifications list — always a valid destination.
  useEffect(() => {
    const routeFromResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const type = response.notification.request.content.data?.type;
      const route = routeForNotificationType(typeof type === "string" ? type : undefined);
      router.push(route ?? "/notifications");
    };
    // Cold-start: replay the tap that launched the app from a killed state.
    Notifications.getLastNotificationResponseAsync().then(routeFromResponse).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    return () => sub.remove();
  }, [router]);

  // Rendered OUTSIDE the providers: a build this old may not be able to talk to
  // the BFF at all, so there is no point mounting auth/query/session behind it.
  if (blocked) {
    return (
      <>
        <StatusBar style="dark" />
        <UpdateRequiredScreen config={config} version={version} />
      </>
    );
  }

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      {/* Explicit, not `auto`: Android edge-to-edge is mandatory from Android 16
          (Expo removed the opt-out), so content draws under the status bar. The
          app is pinned to a light appearance, so the icons must be dark or they
          vanish against our light surfaces. Revisit when dark mode ships. */}
      <StatusBar style="dark" />
      <QueryProvider>
        <SessionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              // iOS otherwise labels the back button with the previous route
              // segment ("(tabs)"); show just the chevron.
              headerBackButtonDisplayMode: "minimal",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="attendance"
              options={{ headerShown: true, title: "Attendance" }}
            />
            <Stack.Screen
              name="payslips"
              options={{ headerShown: true, title: "Payslips" }}
            />
            <Stack.Screen
              name="payslip/[entryId]"
              options={{ headerShown: true, title: "Payslip" }}
            />
            <Stack.Screen
              name="profile"
              options={{ headerShown: true, title: "Profile" }}
            />
            <Stack.Screen
              name="people/[id]"
              options={{ headerShown: true, title: "Profile" }}
            />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: true, title: "Notifications" }}
            />
            <Stack.Screen
              name="approvals"
              options={{ headerShown: true, title: "Approvals" }}
            />
            <Stack.Screen
              name="reports"
              options={{ headerShown: true, title: "Reports" }}
            />
          </Stack>
        </SessionProvider>
      </QueryProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
